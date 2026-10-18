import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { schema, type Db } from "@/db";
import type { LocationIndex } from "@/normalize/location-rules";
import type { IssueDraft } from "./issues";
import type { CandidatePair, LinkSignal } from "./types";

/**
 * Writes the linker's result without losing what people did.
 *
 * Issues are derived from signals and rebuilt on every run, but a person may
 * have assigned one, set its status, written notes or recorded a
 * verification. So instead of wiping the table, each new cluster is matched
 * to the existing issue it overlaps most (signals are the record, so overlap
 * is identity); a matched issue keeps its id, and with it its owner, its
 * notes (events) and its history. Existing issues nothing matched are
 * deleted when untouched, or marked superseded when a person had touched
 * them. The status merges: the linker owns it until a person sets it, and
 * even then fresh evidence of recurrence wins.
 *
 * Only derived rows are rewritten: issue_signals, ticket actions from the
 * export, and recurred / no-recurrence outcomes. Human rows (notes, manual
 * tickets, guest or staff evidence) stay where they are.
 */
export type Tenant = { groupId: string; propertyId: string };

export type ReconcileResult = {
  created: number;
  kept: number;
  deleted: number;
  superseded: number;
  /** Issues a person built or linked by hand that no cluster claimed; kept as they are. */
  keptManual: number;
  reopenedByEvidence: number;
};

type ExistingIssue = {
  id: string;
  status: string;
  statusSource: string;
  statusChangedAt: Date | null;
  ownerUserId: string | null;
  verifiedAt: Date | null;
  openedAt: Date;
  resolvedAt: Date | null;
  reopenCount: number;
  title: string;
  category: string | null;
  severity: string;
  signalIds: string[];
  humanState: boolean;
  /** Fields a person edited by hand (`issue.edited`): the rebuild leaves them alone. */
  edited: Set<string>;
};

const DERIVED_OUTCOMES = ["recurred", "no_recurrence"] as const;

export async function reconcileIssues(
  db: Db,
  tenant: Tenant,
  drafts: IssueDraft[],
  accepted: CandidatePair[],
  index: LocationIndex,
  byId: Map<string, LinkSignal>,
  opts: { jobId?: string | null; now?: Date } = {},
): Promise<ReconcileResult> {
  const now = opts.now ?? new Date();
  const bestPair = new Map<string, CandidatePair>();
  for (const p of accepted) {
    for (const id of [p.a, p.b]) {
      const prev = bestPair.get(id);
      if (!prev || p.score > prev.score) bestPair.set(id, p);
    }
  }

  return db.transaction(async (tx) => {
    // --- what exists -------------------------------------------------------
    const existingRows = await tx
      .select({
        id: schema.issues.id,
        status: schema.issues.status,
        statusSource: schema.issues.statusSource,
        statusChangedAt: schema.issues.statusChangedAt,
        ownerUserId: schema.issues.ownerUserId,
        verifiedAt: schema.issues.verifiedAt,
        openedAt: schema.issues.openedAt,
        resolvedAt: schema.issues.resolvedAt,
        reopenCount: schema.issues.reopenCount,
        title: schema.issues.title,
        category: schema.issues.category,
        severity: schema.issues.severity,
      })
      .from(schema.issues)
      .where(and(eq(schema.issues.propertyId, tenant.propertyId), isNull(schema.issues.supersededAt)));
    const existingIds = existingRows.map((r) => r.id);
    const membership = new Map<string, string[]>();
    const signalToIssue = new Map<string, string>();
    if (existingIds.length) {
      // Only live issues can be claimed; a superseded one keeps its human links but stays out of the matching.
      const links = await tx
        .select({ issueId: schema.issueSignals.issueId, signalId: schema.issueSignals.signalId })
        .from(schema.issueSignals)
        .innerJoin(schema.issues, eq(schema.issues.id, schema.issueSignals.issueId))
        .where(and(eq(schema.issueSignals.propertyId, tenant.propertyId), isNull(schema.issues.supersededAt)));
      for (const l of links) {
        membership.set(l.issueId, [...(membership.get(l.issueId) ?? []), l.signalId]);
        signalToIssue.set(l.signalId, l.issueId);
      }
    }
    const touched = new Set<string>();
    // Records a person linked by hand stay with their issue; an issue made of them is a person's issue.
    const humanLinked = new Set<string>();
    const editedFields = new Map<string, Set<string>>();
    if (existingIds.length) {
      const human = await tx
        .select({ id: schema.issueSignals.issueId })
        .from(schema.issueSignals)
        .where(and(eq(schema.issueSignals.propertyId, tenant.propertyId), sql`${schema.issueSignals.decidedBy} <> 'system'`));
      for (const h of human) {
        touched.add(h.id);
        humanLinked.add(h.id);
      }
      const noted = await tx
        .select({ id: schema.events.entityId, type: schema.events.type, payload: schema.events.payload })
        .from(schema.events)
        .where(and(eq(schema.events.propertyId, tenant.propertyId), eq(schema.events.entityType, "issue"), inArray(schema.events.type, ["issue.note", "issue.edited"])));
      for (const n of noted) {
        touched.add(n.id);
        if (n.type === "issue.edited") {
          const set = editedFields.get(n.id) ?? new Set<string>();
          for (const k of Object.keys(n.payload ?? {})) set.add(k);
          editedFields.set(n.id, set);
        }
      }
      // A check somebody scheduled is a promise to a person: the issue it hangs on is theirs now.
      const checks = await tx
        .select({ id: schema.verificationTasks.issueId })
        .from(schema.verificationTasks)
        .where(and(eq(schema.verificationTasks.propertyId, tenant.propertyId), eq(schema.verificationTasks.status, "open")));
      for (const c of checks) touched.add(c.id);
      const humanOutcomes = await tx
        .select({ id: schema.outcomes.issueId })
        .from(schema.outcomes)
        .where(and(eq(schema.outcomes.propertyId, tenant.propertyId), sql`(${schema.outcomes.kind} in ('guest_confirmed', 'staff_evidence') or jsonb_exists(${schema.outcomes.evidence}, 'by'))`));
      for (const o of humanOutcomes) touched.add(o.id);
      const manualTickets = await tx
        .select({ id: schema.actions.issueId })
        .from(schema.actions)
        .where(and(eq(schema.actions.propertyId, tenant.propertyId), sql`${schema.actions.externalSystem} is distinct from 'ticketing_export'`));
      for (const a of manualTickets) touched.add(a.id);
    }
    const existing: ExistingIssue[] = existingRows.map((r) => ({
      ...r,
      signalIds: membership.get(r.id) ?? [],
      humanState: r.ownerUserId != null || r.statusSource === "human" || r.verifiedAt != null || touched.has(r.id),
      edited: editedFields.get(r.id) ?? new Set<string>(),
    }));
    const existingById = new Map(existing.map((e) => [e.id, e]));

    // --- match drafts to existing issues by signal overlap -----------------
    const claimed = new Set<string>();
    const draftIssueId = new Map<IssueDraft, string | null>();
    const ordered = [...drafts].sort((a, b) => b.signalIds.length - a.signalIds.length);
    for (const d of ordered) {
      const overlap = new Map<string, number>();
      for (const sid of d.signalIds) {
        const iid = signalToIssue.get(sid);
        if (iid && !claimed.has(iid)) overlap.set(iid, (overlap.get(iid) ?? 0) + 1);
      }
      let best: string | null = null;
      let bestScore = 0;
      for (const [iid, n] of overlap) {
        const e = existingById.get(iid);
        if (!e) continue;
        // Overlap first; then the issue that holds the first report; then the one a person touched; then the older one.
        const tie = (n === bestScore && best) ? compareTie(e, existingById.get(best)!, d) : 0;
        if (n > bestScore || (n === bestScore && tie > 0)) {
          best = iid;
          bestScore = n;
        }
      }
      if (best) claimed.add(best);
      draftIssueId.set(d, best);
    }
    const unclaimed = existing.filter((e) => !claimed.has(e.id));

    // --- derived rows go, human rows stay ------------------------------------
    await tx.delete(schema.issueSignals).where(and(eq(schema.issueSignals.propertyId, tenant.propertyId), eq(schema.issueSignals.decidedBy, "system")));
    await tx.delete(schema.actions).where(and(eq(schema.actions.propertyId, tenant.propertyId), eq(schema.actions.externalSystem, "ticketing_export")));
    // Derived outcomes go; the ones a person recorded (evidence.by, possibly referenced by a verification task) stay.
    await tx
      .delete(schema.outcomes)
      .where(and(eq(schema.outcomes.propertyId, tenant.propertyId), inArray(schema.outcomes.kind, [...DERIVED_OUTCOMES]), sql`not jsonb_exists(${schema.outcomes.evidence}, 'by')`));

    // Unclaimed: delete when untouched, keep when a person built it from records,
    // supersede when a person had touched it but its records went elsewhere.
    const toDelete = unclaimed.filter((e) => !e.humanState).map((e) => e.id);
    const toSupersede = unclaimed.filter((e) => e.humanState && !humanLinked.has(e.id));
    if (toDelete.length) await tx.delete(schema.issues).where(inArray(schema.issues.id, toDelete));
    const events: (typeof schema.events.$inferInsert)[] = [];
    for (const e of toSupersede) {
      // The issue that took most of its signals, if any.
      const counts = new Map<IssueDraft, number>();
      for (const sid of e.signalIds) {
        for (const d of drafts) if (d.signalIds.includes(sid)) counts.set(d, (counts.get(d) ?? 0) + 1);
      }
      const successor = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      const successorId = successor ? (draftIssueId.get(successor) ?? null) : null;
      await tx
        .update(schema.issues)
        .set({ supersededAt: now, supersededByIssueId: successorId, lastRebuildJobId: opts.jobId ?? null })
        .where(eq(schema.issues.id, e.id));
      events.push({ ...tenant, entityType: "issue", entityId: e.id, type: "issue.superseded", occurredAt: now, payload: { successor: successorId, job_id: opts.jobId ?? null } });
    }

    // Events already written for claimed issues, so reopen / resolve are not repeated.
    const seenReopen = new Set<string>();
    const seenResolved = new Set<string>();
    if (claimed.size) {
      const prior = await tx
        .select({ id: schema.events.entityId, type: schema.events.type, payload: schema.events.payload, at: schema.events.occurredAt })
        .from(schema.events)
        .where(and(eq(schema.events.propertyId, tenant.propertyId), inArray(schema.events.entityId, [...claimed]), inArray(schema.events.type, ["issue.reopened", "issue.resolved"])));
      for (const p of prior) {
        if (p.type === "issue.reopened") seenReopen.add(`${p.id}|${String(p.payload.signal_id ?? "")}`);
        else seenResolved.add(`${p.id}|${new Date(p.at).getTime()}`);
      }
    }

    // --- write ---------------------------------------------------------------
    let created = 0;
    let kept = 0;
    let reopenedByEvidence = 0;
    const successorIdOf = new Map<IssueDraft, string>();
    const CHUNK = 300;
    for (let i = 0; i < drafts.length; i += CHUNK) {
      const chunk = drafts.slice(i, i + CHUNK);
      const newDrafts = chunk.filter((d) => !draftIssueId.get(d));
      let inserted: { id: string }[] = [];
      if (newDrafts.length) {
        inserted = await tx
          .insert(schema.issues)
          .values(
            newDrafts.map((d) => ({
              ...tenant,
              title: d.title,
              category: d.category,
              severity: d.severity,
              status: d.status,
              derivedStatus: d.status,
              locationId: d.locationCode ? (index.idOf(d.locationCode) ?? null) : null,
              openedAt: d.openedAt,
              resolvedAt: d.resolvedAt,
              reopenCount: d.reopenCount,
              rootCause: d.rootCause,
              recurrenceWindowDays: d.recurrenceWindowDays,
              lastRebuildJobId: opts.jobId ?? null,
            })),
          )
          .returning({ id: schema.issues.id });
        created += inserted.length;
      }
      let k = 0;
      for (const d of chunk) {
        const existingId = draftIssueId.get(d);
        if (existingId) {
          const e = existingById.get(existingId)!;
          const merged = mergeStatus(e, d);
          if (merged.reopenedByEvidence) reopenedByEvidence++;
          // What a person wrote by hand outranks what the rebuild derives: their title, category and
          // severity stay, and the date they resolved it stays while their status stands.
          await tx
            .update(schema.issues)
            .set({
              title: e.edited.has("title") ? e.title : d.title,
              category: e.edited.has("category") ? e.category : d.category,
              severity: e.edited.has("severity") ? (e.severity as typeof d.severity) : d.severity,
              derivedStatus: d.status,
              status: merged.status,
              statusSource: merged.statusSource,
              statusChangedAt: merged.changed ? now : e.statusChangedAt,
              locationId: d.locationCode ? (index.idOf(d.locationCode) ?? null) : null,
              openedAt: d.openedAt,
              resolvedAt: merged.statusSource === "human" ? (e.resolvedAt ?? d.resolvedAt) : d.resolvedAt,
              reopenCount: Math.max(d.reopenCount, merged.status === "reopened" && e.statusSource === "human" ? e.reopenCount : 0),
              rootCause: d.rootCause,
              recurrenceWindowDays: d.recurrenceWindowDays,
              lastRebuildJobId: opts.jobId ?? null,
            })
            .where(eq(schema.issues.id, existingId));
          kept++;
          if (merged.reopenedByEvidence) {
            events.push({ ...tenant, entityType: "issue", entityId: existingId, type: "issue.status_changed", occurredAt: now, payload: { from: e.status, to: "reopened", source: "system", reason: "new evidence after the status was set" } });
          }
          successorIdOf.set(d, existingId);
        } else {
          successorIdOf.set(d, inserted[k++].id);
        }
      }

      const links: (typeof schema.issueSignals.$inferInsert)[] = [];
      const actions: (typeof schema.actions.$inferInsert)[] = [];
      const outcomes: (typeof schema.outcomes.$inferInsert)[] = [];
      for (const d of chunk) {
        const issueId = successorIdOf.get(d)!;
        const isNew = !draftIssueId.get(d);
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
              details: { status: s.wo.status, closed_at: s.wo.closedAt?.toISOString() ?? null, closure_note: s.wo.closureNote, reopened_flag: s.wo.reopened },
            });
          }
        }
        for (const r of d.reopenEvidence) {
          outcomes.push({ ...tenant, issueId, kind: "recurred", strength: 0, observedAt: r.at, evidence: { closed_at: r.closedAt.toISOString(), signal_id: r.signalId } });
          if (isNew || !seenReopen.has(`${issueId}|${r.signalId}`)) {
            events.push({ ...tenant, entityType: "issue", entityId: issueId, type: "issue.reopened", occurredAt: r.at, payload: { signal_id: r.signalId } });
          }
        }
        if (d.status === "closed_unverified" && d.resolvedAt) {
          const at = new Date(d.resolvedAt.getTime() + d.recurrenceWindowDays * 86_400_000);
          outcomes.push({ ...tenant, issueId, kind: "no_recurrence", strength: 1, observedAt: at, evidence: { window_days: d.recurrenceWindowDays } });
        }
        if (isNew) {
          events.push({ ...tenant, entityType: "issue", entityId: issueId, type: "issue.detected", occurredAt: d.openedAt, payload: { signals: d.signalIds.length, topic: d.topic, location: d.locationCode } });
        }
        if (d.resolvedAt && (isNew || !seenResolved.has(`${issueId}|${d.resolvedAt.getTime()}`))) {
          events.push({ ...tenant, entityType: "issue", entityId: issueId, type: "issue.resolved", occurredAt: d.resolvedAt, payload: { status: d.status } });
        }
      }
      for (let j = 0; j < links.length; j += 500) await tx.insert(schema.issueSignals).values(links.slice(j, j + 500)).onConflictDoNothing();
      for (let j = 0; j < actions.length; j += 500) await tx.insert(schema.actions).values(actions.slice(j, j + 500));
      for (let j = 0; j < outcomes.length; j += 500) await tx.insert(schema.outcomes).values(outcomes.slice(j, j + 500));
    }
    for (let j = 0; j < events.length; j += 500) await tx.insert(schema.events).values(events.slice(j, j + 500));

    return { created, kept, deleted: toDelete.length, superseded: toSupersede.length, keptManual: unclaimed.filter((e) => humanLinked.has(e.id)).length, reopenedByEvidence };
  });
}

/** Prefer the issue holding the draft's first report, then one a person touched, then the older one. */
function compareTie(a: ExistingIssue, b: ExistingIssue, d: IssueDraft): number {
  const aHas = a.signalIds.includes(d.primaryId) ? 1 : 0;
  const bHas = b.signalIds.includes(d.primaryId) ? 1 : 0;
  if (aHas !== bHas) return aHas - bHas;
  if (a.humanState !== b.humanState) return a.humanState ? 1 : -1;
  return b.openedAt.getTime() - a.openedAt.getTime();
}

/**
 * The linker owns the status until a person sets it. A human status stays,
 * except that fresh evidence of recurrence (the linker says `reopened` and
 * the reopening report is newer than the person's change) reopens it: that
 * is the lifecycle rule, and the person must look again.
 */
export function mergeStatus(
  e: Pick<ExistingIssue, "status" | "statusSource" | "statusChangedAt">,
  d: Pick<IssueDraft, "status" | "reopenEvidence">,
): { status: IssueDraft["status"]; statusSource: string; changed: boolean; reopenedByEvidence: boolean } {
  if (e.statusSource !== "human") {
    return { status: d.status, statusSource: "system", changed: e.status !== d.status, reopenedByEvidence: false };
  }
  const latestEvidence = d.reopenEvidence.reduce<Date | null>((m, r) => (!m || r.at > m ? r.at : m), null);
  const newer = latestEvidence && e.statusChangedAt ? latestEvidence > e.statusChangedAt : Boolean(latestEvidence && !e.statusChangedAt);
  if (d.status === "reopened" && newer && e.status !== "reopened") {
    return { status: "reopened", statusSource: "system", changed: true, reopenedByEvidence: true };
  }
  return { status: e.status as IssueDraft["status"], statusSource: "human", changed: false, reopenedByEvidence: false };
}
