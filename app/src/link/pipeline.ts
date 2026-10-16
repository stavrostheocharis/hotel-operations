import { and, eq, ne } from "drizzle-orm";
import { schema, type Db } from "@/db";
import { parseDmyHm } from "@/db/scripts/lib/time";
import { findProperty } from "@/db/scripts/seed";
import { LINK_PROMPT_VERSION, type JudgePair, type LlmClient } from "@/normalize/llm";
import { LocationIndex, type LocationRow } from "@/normalize/location-rules";
import { clusterPairs } from "./cluster";
import { cosine, embeddingModelId, loadEmbeddings } from "./embeddings";
import { buildIssue, type IssueDraft } from "./issues";
import { ACCEPT, GRAY_LOW, attachOrphanReviews, generateCandidates, pairKey, type ServesMap } from "./rules";
import { ACTIONABLE_SOURCES, type CandidatePair, type LinkSignal } from "./types";

/**
 * The linking engine: signals → candidate pairs (rules) → gray-zone
 * settlement (embeddings, then the model) → clusters → issues, actions,
 * outcomes and events. Deterministic for the rules; every accepted pair keeps
 * the rule and numbers that produced it in issue_signals.evidence.
 *
 * Rebuilds from scratch for the property on every run: issues are derived
 * data, signals are the record.
 */

export type LinkOptions = {
  propertyCode?: string;
  llm?: LlmClient | null;
  useEmbeddings?: boolean;
  /** Cap on gray pairs sent to the model, highest rule score first. */
  judgeLimit?: number;
  /** "Today" for the verification clock; defaults to the latest signal. */
  asOf?: Date;
  log?: (msg: string) => void;
};

export type LinkResult = {
  signals: number;
  candidates: number;
  acceptedByRules: number;
  gray: number;
  embeddingAdjusted: number;
  llmJudged: number;
  accepted: number;
  clusters: number;
  issues: number;
  multiSignalIssues: number;
  byRule: Record<string, number>;
};

export async function linkSignals(db: Db, opts: LinkOptions = {}): Promise<LinkResult> {
  const log = opts.log ?? (() => {});
  const property = await findProperty(db, opts.propertyCode ?? "ASTRAEA");
  if (!property) throw new Error("property not seeded; run db:seed first");
  const tenant = { groupId: property.groupId, propertyId: property.id };
  const tz = property.timezone;

  const locationRows = (await db
    .select({
      id: schema.locations.id,
      code: schema.locations.code,
      kind: schema.locations.kind,
      aliases: schema.locations.aliases,
      attributes: schema.locations.attributes,
    })
    .from(schema.locations)
    .where(eq(schema.locations.propertyId, property.id))) as LocationRow[];
  const index = new LocationIndex(locationRows);
  const rowById = new Map(locationRows.map((l) => [l.id, l]));
  const buildingOf = (row: LocationRow | undefined): string | null => {
    if (!row) return null;
    const code = row.code.toUpperCase();
    if (row.kind === "building") return code;
    if (row.kind === "floor") return code.split("/")[0];
    const b = row.attributes?.building;
    return typeof b === "string" && index.buildings.has(b.toUpperCase()) ? b.toUpperCase() : null;
  };

  // What serves what: boiler → building, heat pump → pool.
  const links = await db
    .select({ equipmentId: schema.locationLinks.equipmentId, servesId: schema.locationLinks.servesId })
    .from(schema.locationLinks)
    .where(eq(schema.locationLinks.propertyId, property.id));
  const serves: ServesMap = new Map();
  for (const l of links) {
    const e = rowById.get(l.equipmentId)?.code;
    const s = rowById.get(l.servesId)?.code;
    if (!e || !s) continue;
    if (!serves.has(e)) serves.set(e, new Set());
    serves.get(e)!.add(s);
  }

  // Stay check-in per stay_ref, from the PMS signals.
  const stays = await db
    .select({ stayRef: schema.signals.stayRef, occurredAt: schema.signals.occurredAt })
    .from(schema.signals)
    .where(and(eq(schema.signals.propertyId, property.id), eq(schema.signals.source, "pms")));
  const checkIn = new Map(stays.filter((s) => s.stayRef).map((s) => [s.stayRef!, s.occurredAt]));

  const rows = await db
    .select({
      id: schema.signals.id,
      source: schema.signals.source,
      externalId: schema.signals.externalId,
      occurredAt: schema.signals.occurredAt,
      locationId: schema.signals.locationId,
      topic: schema.signals.topic,
      category: schema.signals.category,
      stayRef: schema.signals.stayRef,
      textEn: schema.signals.textEn,
      textOriginal: schema.signals.textOriginal,
      raw: schema.signals.raw,
      normalized: schema.signals.normalized,
    })
    .from(schema.signals)
    .where(and(eq(schema.signals.propertyId, property.id), ne(schema.signals.source, "pms")));

  const buildingHints = new Map<string, string | null>();
  for (const r of rows) {
    const hint = r.normalized?.building_hint;
    buildingHints.set(r.id, typeof hint === "string" ? hint : null);
  }

  // Routine maintenance is not an exception: preventive tickets never link.
  const linkable = rows.filter((r) => r.topic !== "preventive");
  const signals: LinkSignal[] = linkable.map((r) => {
    const loc = r.locationId ? rowById.get(r.locationId) : undefined;
    const raw = r.raw ?? {};
    const str = (k: string) => (raw[k] === null || raw[k] === undefined ? null : String(raw[k]));
    const wo =
      r.source === "work_order"
        ? {
            createdAt: parseDmyHm(str("Created") ?? "", tz) ?? r.occurredAt,
            closedAt: parseDmyHm(str("Closed") ?? "", tz),
            status: str("Status") ?? "",
            reopened: str("Reopened"),
            closureNote: str("Closure Note"),
            technician: str("Technician"),
          }
        : null;
    return {
      id: r.id,
      source: r.source,
      externalId: r.externalId,
      occurredAt: r.occurredAt,
      locationCode: loc?.code ?? null,
      locationKind: loc?.kind ?? null,
      building: buildingOf(loc),
      topic: r.topic,
      category: r.category,
      stayRef: r.stayRef,
      text: r.textEn ?? r.textOriginal,
      wo,
      stayCheckIn: r.source === "survey" && r.stayRef ? checkIn.get(r.stayRef) ?? null : null,
    };
  });
  const byId = new Map(signals.map((s) => [s.id, s]));
  const asOf = opts.asOf ?? new Date(Math.max(...signals.map((s) => s.occurredAt.getTime())));

  // Human decisions pin pairs across rebuilds: `unlink` removes a candidate,
  // `link` is accepted outright.
  const decisions = await db
    .select({ a: schema.linkDecisions.signalA, b: schema.linkDecisions.signalB, decision: schema.linkDecisions.decision, by: schema.linkDecisions.decidedBy })
    .from(schema.linkDecisions)
    .where(eq(schema.linkDecisions.propertyId, property.id));
  const unlinked = new Set(decisions.filter((d) => d.decision === "unlink").map((d) => pairKey(d.a, d.b)));
  const pinned: CandidatePair[] = decisions
    .filter((d) => d.decision === "link" && byId.has(d.a) && byId.has(d.b))
    .map((d) => ({ a: d.a, b: d.b, score: 1, rule: "human", method: "human", evidence: { decided_by: d.by } }));

  // 1. Rules.
  const candidates = generateCandidates(signals, index, serves).filter((c) => !unlinked.has(pairKey(c.a, c.b)));
  candidates.push(...pinned);
  const byRule: Record<string, number> = {};
  for (const c of candidates) byRule[c.rule] = (byRule[c.rule] ?? 0) + 1;
  const acceptedByRules = candidates.filter((c) => c.score >= ACCEPT).length;
  let gray = candidates.filter((c) => c.score >= GRAY_LOW && c.score < ACCEPT);
  log(`${signals.length} signals, ${candidates.length} candidate pairs, ${acceptedByRules} accepted by rules, ${gray.length} gray`);

  // 2. Embeddings on the gray zone.
  let embeddingAdjusted = 0;
  if (opts.useEmbeddings && gray.length) {
    const vectors = await loadEmbeddings(db, property.id, embeddingModelId());
    for (const c of gray) {
      const va = vectors.get(c.a);
      const vb = vectors.get(c.b);
      if (!va || !vb) continue;
      const sim = cosine(va, vb);
      const delta = sim >= 0.8 ? 0.25 : sim >= 0.65 ? 0.12 : sim < 0.35 ? -0.2 : 0;
      if (delta) {
        c.score = Math.max(0, Math.min(1, c.score + delta));
        c.method = "embedding";
        c.evidence = { ...c.evidence, similarity: Math.round(sim * 1000) / 1000 };
        embeddingAdjusted++;
      }
    }
    gray = gray.filter((c) => c.score >= GRAY_LOW && c.score < ACCEPT);
    log(`embeddings adjusted ${embeddingAdjusted} pairs, ${gray.length} still gray`);
  }

  // 3. The model on what is left, most promising pairs first.
  let llmJudged = 0;
  if (opts.llm && gray.length) {
    const llm = opts.llm;
    gray.sort((x, y) => y.score - x.score);
    if (opts.judgeLimit !== undefined) gray = gray.slice(0, opts.judgeLimit);
    const side = (s: LinkSignal) => ({
      source: s.source,
      date: s.occurredAt.toISOString().slice(0, 10),
      location: s.locationCode,
      topic: s.topic,
      text: s.text ? s.text.slice(0, 400) : null,
    });
    const pairs: JudgePair[] = gray.map((c, i) => ({ id: String(i), a: side(byId.get(c.a)!), b: side(byId.get(c.b)!), ruleHint: c.rule }));
    const verdicts = await llm.judgeLinks(pairs);
    const suggestions: (typeof schema.aiSuggestions.$inferInsert)[] = [];
    for (const v of verdicts) {
      const c = gray[Number(v.id)];
      if (!c) continue;
      c.score = v.verdict === "same" ? 0.9 : v.verdict === "related" ? ACCEPT : 0.2;
      c.method = "llm";
      c.evidence = { ...c.evidence, verdict: v.verdict, reason: v.reason, llm_confidence: v.confidence };
      llmJudged++;
      suggestions.push({
        ...tenant,
        kind: "link",
        inputRefs: { signal_ids: [c.a, c.b], rule: c.rule },
        output: { verdict: v.verdict, reason: v.reason },
        model: llm.reasoningModel,
        promptVersion: LINK_PROMPT_VERSION,
        confidence: v.confidence.toFixed(3),
        decision: v.verdict === "unrelated" ? "rejected" : "accepted",
        decidedBy: "system",
        decidedAt: new Date(),
      });
    }
    for (let i = 0; i < suggestions.length; i += 500) await db.insert(schema.aiSuggestions).values(suggestions.slice(i, i + 500));
    log(`model judged ${llmJudged} pairs`);
  }

  // 4. Clusters, then attach the reviews that can only be placed by context, then issues.
  const accepted = candidates.filter((c) => c.score >= ACCEPT);
  const firstPass = clusterPairs(signals.map((s) => s.id), accepted).map((ids) => ids.map((id) => byId.get(id)!));
  const reviewLinks = attachOrphanReviews(signals.filter((s) => s.source === "review"), firstPass, buildingHints).filter(
    (c) => !unlinked.has(pairKey(c.a, c.b)),
  );
  if (reviewLinks.length) {
    accepted.push(...reviewLinks);
    byRule["review-attach"] = reviewLinks.length;
    log(`attached ${reviewLinks.length} reviews by context`);
  }
  const clusters = clusterPairs(signals.map((s) => s.id), accepted);
  const pairsByCluster = new Map<string, CandidatePair[]>();
  const clusterOf = new Map<string, number>();
  clusters.forEach((ids, i) => ids.forEach((id) => clusterOf.set(id, i)));
  for (const p of accepted) {
    const key = String(clusterOf.get(p.a));
    const arr = pairsByCluster.get(key) ?? [];
    arr.push(p);
    pairsByCluster.set(key, arr);
  }

  const drafts: IssueDraft[] = [];
  clusters.forEach((ids, i) => {
    const members = ids.map((id) => byId.get(id)!);
    if (members.length < 2) {
      const s = members[0];
      if (!ACTIONABLE_SOURCES.includes(s.source) || !s.topic) return;
    }
    drafts.push(buildIssue(members, pairsByCluster.get(String(i)) ?? [], index, asOf));
  });
  const multi = drafts.filter((d) => d.signalIds.length >= 2).length;
  log(`${clusters.length} clusters → ${drafts.length} issues (${multi} with 2+ signals)`);

  await persistIssues(db, tenant, drafts, accepted, index, byId);

  return {
    signals: signals.length,
    candidates: candidates.length,
    acceptedByRules,
    gray: gray.length,
    embeddingAdjusted,
    llmJudged,
    accepted: accepted.length,
    clusters: clusters.length,
    issues: drafts.length,
    multiSignalIssues: multi,
    byRule,
  };
}

async function persistIssues(
  db: Db,
  tenant: { groupId: string; propertyId: string },
  drafts: IssueDraft[],
  accepted: CandidatePair[],
  index: LocationIndex,
  byId: Map<string, LinkSignal>,
) {
  const bestPair = new Map<string, CandidatePair>();
  for (const p of accepted) {
    for (const id of [p.a, p.b]) {
      const prev = bestPair.get(id);
      if (!prev || p.score > prev.score) bestPair.set(id, p);
    }
  }

  await db.transaction(async (tx) => {
    // Derived data: wipe and rebuild for the property.
    await tx.delete(schema.issueSignals).where(eq(schema.issueSignals.propertyId, tenant.propertyId));
    await tx.delete(schema.actions).where(eq(schema.actions.propertyId, tenant.propertyId));
    await tx.delete(schema.outcomes).where(eq(schema.outcomes.propertyId, tenant.propertyId));
    await tx.delete(schema.issues).where(eq(schema.issues.propertyId, tenant.propertyId));

    const CHUNK = 300;
    for (let i = 0; i < drafts.length; i += CHUNK) {
      const chunk = drafts.slice(i, i + CHUNK);
      const inserted = await tx
        .insert(schema.issues)
        .values(
          chunk.map((d) => ({
            ...tenant,
            title: d.title,
            category: d.category,
            severity: d.severity,
            status: d.status,
            locationId: d.locationCode ? index.idOf(d.locationCode) ?? null : null,
            openedAt: d.openedAt,
            resolvedAt: d.resolvedAt,
            reopenCount: d.reopenCount,
            rootCause: d.rootCause,
            recurrenceWindowDays: d.recurrenceWindowDays,
          })),
        )
        .returning({ id: schema.issues.id });

      const links: (typeof schema.issueSignals.$inferInsert)[] = [];
      const actions: (typeof schema.actions.$inferInsert)[] = [];
      const outcomes: (typeof schema.outcomes.$inferInsert)[] = [];
      const events: (typeof schema.events.$inferInsert)[] = [];

      chunk.forEach((d, k) => {
        const issueId = inserted[k].id;
        for (const sid of d.signalIds) {
          const pair = bestPair.get(sid);
          links.push({
            ...tenant,
            issueId,
            signalId: sid,
            role: sid === d.primaryId ? "primary" : d.duplicateIds.has(sid) ? "duplicate" : "supporting",
            confidence: (pair ? pair.score : 1).toFixed(3),
            method: pair ? pair.method : "rule",
            evidence: pair ? { rule: pair.rule, ...pair.evidence } : { rule: "singleton" },
            decidedBy: "system",
          });
          const s = byId.get(sid);
          if (s?.wo) {
            actions.push({
              ...tenant,
              issueId,
              kind: "ticket_created",
              externalSystem: "ticketing_export",
              externalRef: s.externalId,
              actor: s.wo.technician,
              performedAt: s.wo.createdAt,
              details: {
                status: s.wo.status,
                closed_at: s.wo.closedAt?.toISOString() ?? null,
                closure_note: s.wo.closureNote,
                reopened_flag: s.wo.reopened,
              },
            });
          }
        }
        for (const r of d.reopenEvidence) {
          outcomes.push({ ...tenant, issueId, kind: "recurred", strength: 0, observedAt: r.at, evidence: { closed_at: r.closedAt.toISOString(), signal_id: r.signalId } });
          events.push({ ...tenant, entityType: "issue", entityId: issueId, type: "issue.reopened", occurredAt: r.at, payload: { signal_id: r.signalId } });
        }
        if (d.status === "closed_unverified" && d.resolvedAt) {
          const at = new Date(d.resolvedAt.getTime() + d.recurrenceWindowDays * 86_400_000);
          outcomes.push({ ...tenant, issueId, kind: "no_recurrence", strength: 1, observedAt: at, evidence: { window_days: d.recurrenceWindowDays } });
        }
        events.push({ ...tenant, entityType: "issue", entityId: issueId, type: "issue.detected", occurredAt: d.openedAt, payload: { signals: d.signalIds.length, topic: d.topic, location: d.locationCode } });
        if (d.resolvedAt) events.push({ ...tenant, entityType: "issue", entityId: issueId, type: "issue.resolved", occurredAt: d.resolvedAt, payload: { status: d.status } });
      });

      for (let j = 0; j < links.length; j += 500) await tx.insert(schema.issueSignals).values(links.slice(j, j + 500));
      for (let j = 0; j < actions.length; j += 500) await tx.insert(schema.actions).values(actions.slice(j, j + 500));
      for (let j = 0; j < outcomes.length; j += 500) await tx.insert(schema.outcomes).values(outcomes.slice(j, j + 500));
      for (let j = 0; j < events.length; j += 500) await tx.insert(schema.events).values(events.slice(j, j + 500));
    }
  });
}
