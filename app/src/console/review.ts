import { and, eq, sql } from "drizzle-orm";
import { assertCan, type Actor } from "@/auth/permissions";
import { schema, withTenant, type Db, type TenantContext, type Tx } from "@/db";
import { pairKey } from "@/link/rules";

/**
 * The review queue: pairs of records the engine could not decide on. The
 * linker leaves them as pending `ai_suggestions` of kind `link`; a person
 * answers same / not the same, which pins the pair in `link_decisions`
 * (so every later rebuild honours it) and, when one side already sits in
 * an issue, attaches the other at once.
 */
export type ReviewSide = {
  id: string;
  source: string;
  externalId: string;
  occurredAt: Date;
  locationCode: string | null;
  locationName: string | null;
  topic: string | null;
  category: string | null;
  textEn: string | null;
  textOriginal: string | null;
  language: string | null;
  issueId: string | null;
  issueTitle: string | null;
};

export type ReviewPair = {
  id: string;
  rule: string;
  score: number;
  model: string;
  verdict: string | null;
  reason: string | null;
  skipped: boolean;
  a: ReviewSide;
  b: ReviewSide;
};

export type DecidedPair = { id: string; decision: string; decidedAt: Date; decidedByName: string | null; aText: string | null; bText: string | null; attachedIssueId: string | null };

type SideRaw = {
  id: string;
  source: string;
  external_id: string;
  occurred_at: Date;
  location_code: string | null;
  location_name: string | null;
  topic: string | null;
  category: string | null;
  text_en: string | null;
  text_original: string | null;
  language: string | null;
  issue_id: string | null;
  issue_title: string | null;
};

const toSide = (r: SideRaw): ReviewSide => ({
  id: r.id,
  source: r.source,
  externalId: r.external_id,
  occurredAt: new Date(r.occurred_at),
  locationCode: r.location_code,
  locationName: r.location_name,
  topic: r.topic,
  category: r.category,
  textEn: r.text_en,
  textOriginal: r.text_original,
  language: r.language,
  issueId: r.issue_id,
  issueTitle: r.issue_title,
});

async function sides(tx: Tx, ids: string[]): Promise<Map<string, ReviewSide>> {
  if (!ids.length) return new Map();
  const rows = await tx.execute<SideRaw>(sql`
    select s.id, s.source::text as source, s.external_id, s.occurred_at, l.code as location_code, l.name as location_name,
           s.topic, s.category, s.text_en, s.text_original, s.language, m.issue_id, i.title as issue_title
    from signals s
    left join locations l on l.id = s.location_id
    left join lateral (select isg.issue_id from issue_signals isg join issues ii on ii.id = isg.issue_id where isg.signal_id = s.id and ii.superseded_at is null order by isg.decided_at desc limit 1) m on true
    left join issues i on i.id = m.issue_id
    where s.id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
  `);
  return new Map(rows.map((r) => [r.id, toSide(r)]));
}

type SuggestionRaw = { id: string; input_refs: { signal_ids?: string[]; rule?: string; score?: number }; output: { verdict?: string | null; reason?: string | null; skipped?: boolean }; model: string; confidence: string | null };

export async function listReviewPairs(db: Db, ctx: TenantContext, p: { limit?: number } = {}): Promise<{ pairs: ReviewPair[]; total: number }> {
  const limit = p.limit ?? 5;
  return withTenant(db, ctx, async (tx) => {
    const rows = await tx.execute<SuggestionRaw & { total: number }>(sql`
      select id, input_refs, output, model, confidence, count(*) over ()::int as total
      from ai_suggestions
      where kind = 'link' and decision = 'pending'
      order by coalesce((output->>'skipped')::boolean, false) asc, confidence desc nulls last, created_at
      limit ${limit}
    `);
    const ids = rows.flatMap((r) => r.input_refs.signal_ids ?? []);
    const map = await sides(tx, ids);
    const pairs: ReviewPair[] = [];
    for (const r of rows) {
      const [aId, bId] = r.input_refs.signal_ids ?? [];
      const a = aId ? map.get(aId) : undefined;
      const b = bId ? map.get(bId) : undefined;
      if (!a || !b) continue;
      pairs.push({
        id: r.id,
        rule: r.input_refs.rule ?? "",
        score: r.confidence === null ? (r.input_refs.score ?? 0) : Number(r.confidence),
        model: r.model,
        verdict: r.output.verdict ?? null,
        reason: r.output.reason ?? null,
        skipped: Boolean(r.output.skipped),
        a,
        b,
      });
    }
    return { pairs, total: rows[0]?.total ?? 0 };
  });
}

/** Decisions taken in the last seven days, the one productivity number on the Review screen. */
export async function countDecidedThisWeek(db: Db, ctx: TenantContext): Promise<number> {
  return withTenant(db, ctx, async (tx) => {
    const [r] = await tx.execute<{ n: number }>(sql`select count(*)::int as n from ai_suggestions where kind = 'link' and decision in ('accepted', 'rejected') and decided_at > now() - interval '7 days'`);
    return r?.n ?? 0;
  });
}

export async function countPendingPairs(db: Db, ctx: TenantContext): Promise<number> {
  return withTenant(db, ctx, async (tx) => {
    const [r] = await tx.execute<{ n: number }>(sql`select count(*)::int as n from ai_suggestions where kind = 'link' and decision = 'pending'`);
    return r?.n ?? 0;
  });
}

export async function listDecidedPairs(db: Db, ctx: TenantContext, limit = 10): Promise<DecidedPair[]> {
  return withTenant(db, ctx, async (tx) => {
    const rows = await tx.execute<{ id: string; decision: string; decided_at: Date; decided_by_name: string | null; a_text: string | null; b_text: string | null; attached_issue_id: string | null }>(sql`
      select a.id, a.decision::text as decision, a.decided_at, u.name as decided_by_name,
             (select coalesce(s.text_en, s.text_original) from signals s where s.id = (a.input_refs->'signal_ids'->>0)::uuid) as a_text,
             (select coalesce(s.text_en, s.text_original) from signals s where s.id = (a.input_refs->'signal_ids'->>1)::uuid) as b_text,
             a.output->>'attached_issue_id' as attached_issue_id
      from ai_suggestions a left join users u on u.id::text = a.decided_by
      where a.kind = 'link' and a.decision <> 'pending' and a.decided_by <> 'system' and a.decided_at > now() - interval '7 days'
      order by a.decided_at desc
      limit ${limit}
    `);
    return rows.map((r) => ({ id: r.id, decision: r.decision, decidedAt: new Date(r.decided_at), decidedByName: r.decided_by_name, aText: r.a_text, bText: r.b_text, attachedIssueId: r.attached_issue_id }));
  });
}

export type PairVerdict = "same" | "different" | "skip";

/**
 * same → pin `link`, and attach the loose side to the other's issue when
 * exactly one side has one; different → pin `unlink` (and detach nothing:
 * the next run separates them); skip → leave pending, at the back.
 */
export async function decidePair(db: Db, ctx: TenantContext, actor: Actor, input: { suggestionId: string; verdict: PairVerdict }): Promise<{ attachedIssueId: string | null; merged: boolean }> {
  assertCan(actor, "links.decide");
  return withTenant(db, ctx, async (tx) => {
    const [s] = await tx
      .select({ id: schema.aiSuggestions.id, groupId: schema.aiSuggestions.groupId, propertyId: schema.aiSuggestions.propertyId, inputRefs: schema.aiSuggestions.inputRefs, output: schema.aiSuggestions.output, decision: schema.aiSuggestions.decision })
      .from(schema.aiSuggestions)
      .where(and(eq(schema.aiSuggestions.id, input.suggestionId), eq(schema.aiSuggestions.kind, "link")));
    if (!s) throw new Error("pair not found");
    if (s.decision !== "pending") throw new Error("pair already decided");
    const ids = (s.inputRefs as { signal_ids?: string[] }).signal_ids ?? [];
    if (ids.length !== 2) throw new Error("pair is malformed");
    const now = new Date();
    const tenant = { groupId: s.groupId, propertyId: s.propertyId };

    if (input.verdict === "skip") {
      await tx.update(schema.aiSuggestions).set({ output: { ...(s.output as Record<string, unknown>), skipped: true } }).where(eq(schema.aiSuggestions.id, s.id));
      return { attachedIssueId: null, merged: false };
    }

    const [a, b] = ids[0] < ids[1] ? [ids[0], ids[1]] : [ids[1], ids[0]];
    const decision = input.verdict === "same" ? "link" : "unlink";
    await tx
      .insert(schema.linkDecisions)
      .values({ ...tenant, signalA: a, signalB: b, decision, decidedBy: actor.userId, note: null })
      .onConflictDoUpdate({ target: [schema.linkDecisions.propertyId, schema.linkDecisions.signalA, schema.linkDecisions.signalB], set: { decision, decidedBy: actor.userId, createdAt: now } });

    let attachedIssueId: string | null = null;
    let attachedSignalId: string | null = null;
    let merged = false;
    if (input.verdict === "same") {
      const m = await sides(tx, ids);
      const inA = m.get(ids[0])?.issueId ?? null;
      const inB = m.get(ids[1])?.issueId ?? null;
      if (inA && !inB) {
        attachedIssueId = await attach(tx, tenant, inA, ids[1], actor);
        attachedSignalId = ids[1];
      } else if (inB && !inA) {
        attachedIssueId = await attach(tx, tenant, inB, ids[0], actor);
        attachedSignalId = ids[0];
      } else if (inA && inB && inA !== inB) {
        merged = true; // two issues: the next run merges them through the pin
      }
    }
    await tx
      .update(schema.aiSuggestions)
      .set({
        decision: input.verdict === "same" ? "accepted" : "rejected",
        decidedBy: actor.userId,
        decidedAt: now,
        output: { ...(s.output as Record<string, unknown>), skipped: false, attached_issue_id: attachedIssueId, attached_signal_id: attachedSignalId },
      })
      .where(eq(schema.aiSuggestions.id, s.id));
    await tx.insert(schema.events).values({ ...tenant, entityType: "signal", entityId: ids[0], type: "pair.decided", actor: actor.userId, payload: { suggestion_id: s.id, signal_ids: ids, verdict: input.verdict, attached_issue_id: attachedIssueId } });
    return { attachedIssueId, merged };
  });
}

async function attach(tx: Tx, tenant: { groupId: string; propertyId: string }, issueId: string, signalId: string, actor: Actor): Promise<string> {
  await tx
    .insert(schema.issueSignals)
    .values({ ...tenant, issueId, signalId, role: "supporting", confidence: "1.000", method: "human", evidence: { rule: "review" }, decidedBy: actor.userId })
    .onConflictDoNothing();
  await tx.insert(schema.events).values({ ...tenant, entityType: "issue", entityId: issueId, type: "issue.link_confirmed", actor: actor.userId, payload: { signal_id: signalId, via: "review" } });
  return issueId;
}

/** Take a decision back: the pair is pending again, the pin is gone, an attachment made by the decision is removed. */
export async function undoPairDecision(db: Db, ctx: TenantContext, actor: Actor, input: { suggestionId: string }): Promise<void> {
  assertCan(actor, "links.decide");
  return withTenant(db, ctx, async (tx) => {
    const [s] = await tx
      .select({ id: schema.aiSuggestions.id, groupId: schema.aiSuggestions.groupId, propertyId: schema.aiSuggestions.propertyId, inputRefs: schema.aiSuggestions.inputRefs, output: schema.aiSuggestions.output, decision: schema.aiSuggestions.decision, decidedBy: schema.aiSuggestions.decidedBy })
      .from(schema.aiSuggestions)
      .where(and(eq(schema.aiSuggestions.id, input.suggestionId), eq(schema.aiSuggestions.kind, "link")));
    if (!s || s.decision === "pending" || s.decidedBy === "system") throw new Error("nothing to undo");
    const ids = (s.inputRefs as { signal_ids?: string[] }).signal_ids ?? [];
    const [a, b] = ids[0] < ids[1] ? [ids[0], ids[1]] : [ids[1], ids[0]];
    await tx.delete(schema.linkDecisions).where(and(eq(schema.linkDecisions.propertyId, s.propertyId), eq(schema.linkDecisions.signalA, a), eq(schema.linkDecisions.signalB, b)));
    const out = s.output as { attached_issue_id?: string | null; attached_signal_id?: string | null };
    if (out.attached_issue_id && out.attached_signal_id) {
      await tx.delete(schema.issueSignals).where(and(eq(schema.issueSignals.issueId, out.attached_issue_id), eq(schema.issueSignals.signalId, out.attached_signal_id), eq(schema.issueSignals.method, "human")));
    }
    await tx.update(schema.aiSuggestions).set({ decision: "pending", decidedBy: null, decidedAt: null, output: { ...out, skipped: false, attached_issue_id: null, attached_signal_id: null } }).where(eq(schema.aiSuggestions.id, s.id));
    await tx.insert(schema.events).values({ groupId: s.groupId, propertyId: s.propertyId, entityType: "signal", entityId: ids[0], type: "pair.undone", actor: actor.userId, payload: { suggestion_id: s.id, signal_ids: ids } });
  });
}

export { pairKey };
