import { eq } from "drizzle-orm";
import { assertCan, type Actor } from "@/auth/permissions";
import { schema, withTenant, type Db, type TenantContext, type Tx } from "@/db";

/**
 * What a person can do to an issue, as plain functions over the database
 * (the server actions in issue-actions.ts wrap these with the viewer). Every
 * change writes the columns that hold the current state and an event that
 * holds the history; notes are events only.
 */
type IssueRow = {
  id: string;
  groupId: string;
  propertyId: string;
  status: string;
  department: string | null;
  ownerUserId: string | null;
  reopenCount: number;
};

async function loadIssue(tx: Tx, issueId: string): Promise<IssueRow> {
  const [row] = await tx
    .select({
      id: schema.issues.id,
      groupId: schema.issues.groupId,
      propertyId: schema.issues.propertyId,
      status: schema.issues.status,
      department: schema.issues.department,
      ownerUserId: schema.issues.ownerUserId,
      reopenCount: schema.issues.reopenCount,
    })
    .from(schema.issues)
    .where(eq(schema.issues.id, issueId));
  if (!row) throw new Error("issue not found");
  return row;
}

type Dept = (typeof schema.department.enumValues)[number];
type Status = (typeof schema.issueStatus.enumValues)[number];
const STATUSES = schema.issueStatus.enumValues;
const DEPARTMENTS = schema.department.enumValues;

export async function assignIssue(
  db: Db,
  ctx: TenantContext,
  actor: Actor,
  input: { issueId: string; ownerUserId: string | null; ownerName?: string | null; department: string | null; note?: string | null },
): Promise<{ status: string }> {
  if (input.department && !DEPARTMENTS.includes(input.department as Dept)) throw new Error("unknown department");
  return withTenant(db, ctx, async (tx) => {
    const issue = await loadIssue(tx, input.issueId);
    assertCan(actor, "issue.assign", { department: issue.department as Dept | null, ownerUserId: issue.ownerUserId });
    const now = new Date();
    const nextStatus: Status = issue.status === "detected" || issue.status === "reopened" ? "assigned" : (issue.status as Status);
    const changed = nextStatus !== issue.status;
    await tx
      .update(schema.issues)
      .set({
        ownerUserId: input.ownerUserId,
        department: (input.department as Dept | null) ?? (issue.department as Dept | null),
        assignedAt: now,
        assignedBy: actor.userId,
        ...(changed ? { status: nextStatus, statusSource: "human", statusChangedAt: now, statusChangedBy: actor.userId } : {}),
      })
      .where(eq(schema.issues.id, issue.id));
    const tenant = { groupId: issue.groupId, propertyId: issue.propertyId };
    const base = { ...tenant, entityType: "issue", entityId: issue.id, actor: actor.userId, occurredAt: now };
    await tx.insert(schema.events).values([
      { ...base, type: "issue.assigned", payload: { owner_user_id: input.ownerUserId, owner_name: input.ownerName ?? null, department: input.department ?? issue.department, previous_owner: issue.ownerUserId } },
      ...(changed ? [{ ...base, type: "issue.status_changed", payload: { from: issue.status, to: nextStatus, source: "human" } }] : []),
      ...(input.note?.trim() ? [{ ...base, type: "issue.note", payload: { text: input.note.trim() } }] : []),
    ]);
    return { status: nextStatus };
  });
}

export async function resolveIssue(
  db: Db,
  ctx: TenantContext,
  actor: Actor,
  input: { issueId: string; note: string; ticketRef?: string | null },
): Promise<void> {
  const note = input.note.trim();
  if (!note) throw new Error("a resolution note is required");
  return withTenant(db, ctx, async (tx) => {
    const issue = await loadIssue(tx, input.issueId);
    assertCan(actor, "issue.status", { department: issue.department as Dept | null, ownerUserId: issue.ownerUserId });
    const now = new Date();
    await tx
      .update(schema.issues)
      .set({ status: "resolved", statusSource: "human", statusChangedAt: now, statusChangedBy: actor.userId, resolvedAt: now })
      .where(eq(schema.issues.id, issue.id));
    const tenant = { groupId: issue.groupId, propertyId: issue.propertyId };
    const base = { ...tenant, entityType: "issue", entityId: issue.id, actor: actor.userId, occurredAt: now };
    const ticketRef = input.ticketRef?.trim();
    if (ticketRef) {
      await tx.insert(schema.actions).values({ ...tenant, issueId: issue.id, kind: "ticket_created", externalSystem: "manual", externalRef: ticketRef, actor: actor.userId, performedAt: now, details: { status: "closed", closed_at: now.toISOString(), closure_note: note } });
    }
    await tx.insert(schema.events).values([
      { ...base, type: "issue.status_changed", payload: { from: issue.status, to: "resolved", source: "human", reason: note, ticket_ref: ticketRef ?? null } },
      { ...base, type: "issue.note", payload: { text: note } },
    ]);
  });
}

export type OutcomeResult = "staff_evidence" | "guest_confirmed" | "recurred";
const STRENGTH: Record<OutcomeResult, number> = { guest_confirmed: 3, staff_evidence: 2, recurred: 0 };

/** A person's word on whether the fix held. Held → verified; came back → reopened. */
export async function recordOutcome(
  db: Db,
  ctx: TenantContext,
  actor: Actor,
  input: { issueId: string; result: OutcomeResult; note?: string | null; observedAt?: Date | null },
): Promise<{ status: Status; outcomeId: string }> {
  return withTenant(db, ctx, (tx) => recordOutcomeIn(tx, actor, input));
}

/** The same, inside a transaction the caller owns (verification tasks complete through here). */
export async function recordOutcomeIn(
  tx: Tx,
  actor: Actor,
  input: { issueId: string; result: OutcomeResult; note?: string | null; observedAt?: Date | null },
  opts: { preauthorized?: boolean } = {},
): Promise<{ status: Status; outcomeId: string }> {
  if (!(input.result in STRENGTH)) throw new Error("unknown result");
  {
    const issue = await loadIssue(tx, input.issueId);
    // A verification task carries its own authorization (the assignee); otherwise the issue's.
    if (!opts.preauthorized) assertCan(actor, "issue.verify", { department: issue.department as Dept | null, ownerUserId: issue.ownerUserId });
    const now = new Date();
    const at = input.observedAt ?? now;
    const note = input.note?.trim() || null;
    const tenant = { groupId: issue.groupId, propertyId: issue.propertyId };
    const [outcome] = await tx
      .insert(schema.outcomes)
      .values({ ...tenant, issueId: issue.id, kind: input.result, strength: STRENGTH[input.result], observedAt: at, evidence: { note, by: actor.userId } })
      .returning({ id: schema.outcomes.id });
    const held = input.result !== "recurred";
    const nextStatus: Status = held ? "verified" : "reopened";
    await tx
      .update(schema.issues)
      .set({
        status: nextStatus,
        statusSource: "human",
        statusChangedAt: now,
        statusChangedBy: actor.userId,
        ...(held ? { verifiedAt: at, verifiedBy: actor.userId } : { reopenCount: issue.reopenCount + 1 }),
      })
      .where(eq(schema.issues.id, issue.id));
    const base = { ...tenant, entityType: "issue", entityId: issue.id, actor: actor.userId, occurredAt: now };
    await tx.insert(schema.events).values([
      { ...base, type: held ? "issue.verified" : "issue.reopened", payload: { outcome_id: outcome.id, result: input.result, note, observed_at: at.toISOString() } },
      { ...base, type: "issue.status_changed", payload: { from: issue.status, to: nextStatus, source: "human", reason: note } },
      ...(note ? [{ ...base, type: "issue.note", payload: { text: note } }] : []),
    ]);
    return { status: nextStatus, outcomeId: outcome.id };
  }
}

/** An explicit status from the "More" menu. closed_unverified is a manager's call. */
export async function changeIssueStatus(
  db: Db,
  ctx: TenantContext,
  actor: Actor,
  input: { issueId: string; status: string; reason?: string | null },
): Promise<void> {
  if (!STATUSES.includes(input.status as Status)) throw new Error("unknown status");
  return withTenant(db, ctx, async (tx) => {
    const issue = await loadIssue(tx, input.issueId);
    assertCan(actor, "issue.status", { department: issue.department as Dept | null, ownerUserId: issue.ownerUserId });
    if (input.status === "closed_unverified") assertCan(actor, "settings.property");
    if (input.status === issue.status) return;
    const now = new Date();
    const reason = input.reason?.trim() || null;
    await tx
      .update(schema.issues)
      .set({
        status: input.status as Status,
        statusSource: "human",
        statusChangedAt: now,
        statusChangedBy: actor.userId,
        ...(input.status === "resolved" ? { resolvedAt: now } : {}),
        ...(input.status === "reopened" ? { reopenCount: issue.reopenCount + 1 } : {}),
      })
      .where(eq(schema.issues.id, issue.id));
    const base = { groupId: issue.groupId, propertyId: issue.propertyId, entityType: "issue", entityId: issue.id, actor: actor.userId, occurredAt: now };
    await tx.insert(schema.events).values([
      { ...base, type: "issue.status_changed", payload: { from: issue.status, to: input.status, source: "human", reason } },
      ...(reason ? [{ ...base, type: "issue.note", payload: { text: reason } }] : []),
    ]);
  });
}

export async function addIssueNote(db: Db, ctx: TenantContext, actor: Actor, input: { issueId: string; text: string }): Promise<void> {
  const text = input.text.trim();
  if (!text) throw new Error("an empty note");
  return withTenant(db, ctx, async (tx) => {
    const issue = await loadIssue(tx, input.issueId);
    assertCan(actor, "issue.note");
    await tx.insert(schema.events).values({ groupId: issue.groupId, propertyId: issue.propertyId, entityType: "issue", entityId: issue.id, type: "issue.note", actor: actor.userId, payload: { text } });
  });
}

export async function editIssue(
  db: Db,
  ctx: TenantContext,
  actor: Actor,
  input: { issueId: string; title?: string | null; category?: string | null; severity?: string | null; department?: string | null },
): Promise<void> {
  return withTenant(db, ctx, async (tx) => {
    const issue = await loadIssue(tx, input.issueId);
    assertCan(actor, "issue.edit");
    const set: Partial<typeof schema.issues.$inferInsert> = {};
    const changes: Record<string, unknown> = {};
    const title = input.title?.trim();
    if (title) {
      set.title = title;
      changes.title = title;
    }
    if (input.category) {
      set.category = input.category;
      changes.category = input.category;
    }
    if (input.severity && schema.issueSeverity.enumValues.includes(input.severity as (typeof schema.issueSeverity.enumValues)[number])) {
      set.severity = input.severity as (typeof schema.issueSeverity.enumValues)[number];
      changes.severity = input.severity;
    }
    if (input.department && DEPARTMENTS.includes(input.department as Dept)) {
      set.department = input.department as Dept;
      changes.department = input.department;
    }
    if (!Object.keys(changes).length) return;
    await tx.update(schema.issues).set(set).where(eq(schema.issues.id, issue.id));
    await tx.insert(schema.events).values({ groupId: issue.groupId, propertyId: issue.propertyId, entityType: "issue", entityId: issue.id, type: "issue.edited", actor: actor.userId, payload: changes });
  });
}
