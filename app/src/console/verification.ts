import { and, eq, sql } from "drizzle-orm";
import { assertCan, type Actor, type Department } from "@/auth/permissions";
import { schema, withTenant, type Db, type TenantContext } from "@/db";
import { recordOutcomeIn, type OutcomeResult } from "./issue-workflow";

/**
 * Verification tasks: "check that it held". Reads for the Verifications
 * screen and Today, and the three things a person does with a task:
 * schedule, complete (held / came back / could not check), skip.
 */
export type VerificationView = "due" | "week" | "mine" | "done" | "open";
export const VERIFICATION_VIEWS: VerificationView[] = ["due", "week", "mine", "done", "open"];

export type VerificationRow = {
  id: string;
  issueId: string;
  issueTitle: string;
  issueStatus: string;
  issueDepartment: string | null;
  locationCode: string | null;
  locationName: string | null;
  dueAt: Date;
  instructions: string | null;
  assigneeUserId: string | null;
  assigneeName: string | null;
  assigneeDepartment: string | null;
  status: string;
  result: string | null;
  note: string | null;
  doneAt: Date | null;
  doneByName: string | null;
  createdAt: Date;
};

type ListParams = {
  view: VerificationView;
  now: Date;
  timeZone: string;
  userId: string;
  department?: string | null;
  q?: string | null;
  page?: number;
  pageSize?: number;
};

const dayBounds = (tz: string) => ({
  todayEnd: sql`(((now() at time zone ${tz})::date + 1)::timestamp at time zone ${tz})`,
  weekEnd: sql`(((now() at time zone ${tz})::date + 7)::timestamp at time zone ${tz})`,
});

function viewWhere(view: VerificationView, tz: string, userId: string) {
  const { todayEnd, weekEnd } = dayBounds(tz);
  switch (view) {
    case "due":
      return sql`v.status = 'open' and v.due_at < ${todayEnd}`;
    case "week":
      return sql`v.status = 'open' and v.due_at < ${weekEnd}`;
    case "mine":
      return sql`v.status = 'open' and v.assignee_user_id = ${userId}`;
    case "done":
      return sql`v.status <> 'open' and coalesce(v.done_at, v.created_at) > now() - interval '30 days'`;
    case "open":
      return sql`v.status = 'open'`;
  }
}

const COLUMNS = sql`
  v.id, v.issue_id, i.title as issue_title, i.status::text as issue_status, i.department::text as issue_department,
  l.code as location_code, l.name as location_name, v.due_at, v.instructions,
  v.assignee_user_id, au.name as assignee_name, v.assignee_department::text as assignee_department,
  v.status::text as status, v.result, v.note, v.done_at, du.name as done_by_name, v.created_at`;
const FROM = sql`
  from verification_tasks v
  join issues i on i.id = v.issue_id
  left join locations l on l.id = v.location_id
  left join users au on au.id = v.assignee_user_id
  left join users du on du.id = v.done_by`;
const SELECT = sql`select ${COLUMNS} ${FROM}`;

type Raw = {
  id: string;
  issue_id: string;
  issue_title: string;
  issue_status: string;
  issue_department: string | null;
  location_code: string | null;
  location_name: string | null;
  due_at: Date;
  instructions: string | null;
  assignee_user_id: string | null;
  assignee_name: string | null;
  assignee_department: string | null;
  status: string;
  result: string | null;
  note: string | null;
  done_at: Date | null;
  done_by_name: string | null;
  created_at: Date;
  total?: number;
};

const toRow = (r: Raw): VerificationRow => ({
  id: r.id,
  issueId: r.issue_id,
  issueTitle: r.issue_title,
  issueStatus: r.issue_status,
  issueDepartment: r.issue_department,
  locationCode: r.location_code,
  locationName: r.location_name,
  dueAt: new Date(r.due_at),
  instructions: r.instructions,
  assigneeUserId: r.assignee_user_id,
  assigneeName: r.assignee_name,
  assigneeDepartment: r.assignee_department,
  status: r.status,
  result: r.result,
  note: r.note,
  doneAt: r.done_at ? new Date(r.done_at) : null,
  doneByName: r.done_by_name,
  createdAt: new Date(r.created_at),
});

export async function listVerifications(db: Db, ctx: TenantContext, p: ListParams): Promise<{ rows: VerificationRow[]; total: number }> {
  const pageSize = p.pageSize ?? 25;
  const page = Math.max(1, p.page ?? 1);
  return withTenant(db, ctx, async (tx) => {
    const filters = [viewWhere(p.view, p.timeZone, p.userId)];
    if (p.department) filters.push(sql`coalesce(v.assignee_department, i.department) = ${p.department}`);
    if (p.q?.trim()) {
      const q = `%${p.q.trim()}%`;
      filters.push(sql`(i.title ilike ${q} or l.code ilike ${q} or l.name ilike ${q})`);
    }
    const rows = await tx.execute<Raw>(sql`
      select ${COLUMNS}, count(*) over ()::int as total
      ${FROM}
      where ${sql.join(filters, sql` and `)}
      order by ${p.view === "done" ? sql`v.done_at desc nulls last` : sql`v.due_at asc`}, v.created_at
      limit ${pageSize} offset ${(page - 1) * pageSize}
    `);
    return { rows: rows.map(toRow), total: rows[0]?.total ?? 0 };
  });
}

export async function countVerificationViews(db: Db, ctx: TenantContext, p: { timeZone: string; userId: string; department?: string | null }): Promise<Record<VerificationView, number>> {
  return withTenant(db, ctx, async (tx) => {
    const dept = p.department ? sql`and coalesce(v.assignee_department, i.department) = ${p.department}` : sql``;
    const [r] = await tx.execute<Record<VerificationView, number>>(sql`
      select
        count(*) filter (where ${viewWhere("due", p.timeZone, p.userId)})::int as due,
        count(*) filter (where ${viewWhere("week", p.timeZone, p.userId)})::int as week,
        count(*) filter (where ${viewWhere("mine", p.timeZone, p.userId)})::int as mine,
        count(*) filter (where ${viewWhere("done", p.timeZone, p.userId)})::int as done,
        count(*) filter (where ${viewWhere("open", p.timeZone, p.userId)})::int as open
      from verification_tasks v join issues i on i.id = v.issue_id
      where true ${dept}
    `);
    return r ?? { due: 0, week: 0, mine: 0, done: 0, open: 0 };
  });
}

/** Open tasks due today or earlier: the sidebar badge. */
export async function countDueToday(db: Db, ctx: TenantContext, timeZone: string): Promise<number> {
  return withTenant(db, ctx, async (tx) => {
    const [r] = await tx.execute<{ n: number }>(sql`
      select count(*)::int as n from verification_tasks v where ${viewWhere("due", timeZone, "")}
    `);
    return r?.n ?? 0;
  });
}

export async function getVerification(db: Db, ctx: TenantContext, id: string): Promise<VerificationRow | null> {
  return withTenant(db, ctx, async (tx) => {
    const [r] = await tx.execute<Raw>(sql`${SELECT} where v.id = ${id}`);
    return r ? toRow(r) : null;
  });
}

// ---------------------------------------------------------------------------

export async function scheduleVerification(
  db: Db,
  ctx: TenantContext,
  actor: Actor,
  input: { issueId: string; dueAt: Date; instructions?: string | null; assigneeUserId?: string | null; assigneeDepartment?: string | null; locationId?: string | null },
): Promise<{ id: string }> {
  return withTenant(db, ctx, async (tx) => {
    const [issue] = await tx
      .select({ id: schema.issues.id, groupId: schema.issues.groupId, propertyId: schema.issues.propertyId, locationId: schema.issues.locationId, department: schema.issues.department, ownerUserId: schema.issues.ownerUserId })
      .from(schema.issues)
      .where(eq(schema.issues.id, input.issueId));
    if (!issue) throw new Error("issue not found");
    assertCan(actor, "verification.schedule", { department: issue.department as Department | null, ownerUserId: issue.ownerUserId });
    const tenant = { groupId: issue.groupId, propertyId: issue.propertyId };
    const [task] = await tx
      .insert(schema.verificationTasks)
      .values({
        ...tenant,
        issueId: issue.id,
        locationId: input.locationId ?? issue.locationId,
        dueAt: input.dueAt,
        instructions: input.instructions?.trim() || null,
        assigneeUserId: input.assigneeUserId ?? issue.ownerUserId,
        assigneeDepartment: (input.assigneeDepartment as Department | null) ?? (issue.department as Department | null),
        createdBy: actor.userId,
      })
      .returning({ id: schema.verificationTasks.id });
    await tx.insert(schema.events).values({
      ...tenant,
      entityType: "issue",
      entityId: issue.id,
      type: "verification.scheduled",
      actor: actor.userId,
      payload: { task_id: task.id, due_at: input.dueAt.toISOString(), assignee_user_id: input.assigneeUserId ?? issue.ownerUserId, location_id: input.locationId ?? issue.locationId },
    });
    return { id: task.id };
  });
}

export type CompletionResult = OutcomeResult | "could_not";

/**
 * The done form. Held or came back records an outcome on the issue (and
 * moves it to verified or reopened); "could not check" moves the due date.
 */
export async function completeVerification(
  db: Db,
  ctx: TenantContext,
  actor: Actor,
  input: { taskId: string; result: CompletionResult; note?: string | null; observedAt?: Date | null; rescheduleTo?: Date | null },
): Promise<{ status: string; issueStatus: string | null }> {
  return withTenant(db, ctx, async (tx) => {
    const [task] = await tx.select().from(schema.verificationTasks).where(eq(schema.verificationTasks.id, input.taskId));
    if (!task) throw new Error("task not found");
    if (task.status !== "open") throw new Error("task is already closed");
    assertCan(actor, "verification.complete", { department: task.assigneeDepartment, ownerUserId: task.assigneeUserId });
    const now = new Date();
    const tenant = { groupId: task.groupId, propertyId: task.propertyId };
    const note = input.note?.trim() || null;
    if (input.result === "could_not") {
      const dueAt = input.rescheduleTo ?? new Date(now.getTime() + 86_400_000);
      await tx.update(schema.verificationTasks).set({ dueAt, note }).where(eq(schema.verificationTasks.id, task.id));
      await tx.insert(schema.events).values({ ...tenant, entityType: "issue", entityId: task.issueId, type: "verification.rescheduled", actor: actor.userId, payload: { task_id: task.id, due_at: dueAt.toISOString(), note } });
      return { status: "open", issueStatus: null };
    }
    const { status, outcomeId } = await recordOutcomeIn(tx, actor, { issueId: task.issueId, result: input.result, note, observedAt: input.observedAt ?? now }, { preauthorized: true });
    await tx
      .update(schema.verificationTasks)
      .set({ status: "done", result: input.result, outcomeId, note, doneAt: now, doneBy: actor.userId })
      .where(eq(schema.verificationTasks.id, task.id));
    await tx.insert(schema.events).values({ ...tenant, entityType: "issue", entityId: task.issueId, type: "verification.done", actor: actor.userId, payload: { task_id: task.id, result: input.result, outcome_id: outcomeId, note } });
    return { status: "done", issueStatus: status };
  });
}

export async function skipVerification(db: Db, ctx: TenantContext, actor: Actor, input: { taskId: string; reason?: string | null }): Promise<void> {
  return withTenant(db, ctx, async (tx) => {
    const [task] = await tx.select().from(schema.verificationTasks).where(and(eq(schema.verificationTasks.id, input.taskId), eq(schema.verificationTasks.status, "open")));
    if (!task) throw new Error("task not found");
    assertCan(actor, "verification.schedule", { department: task.assigneeDepartment, ownerUserId: task.assigneeUserId });
    const now = new Date();
    await tx.update(schema.verificationTasks).set({ status: "skipped", note: input.reason?.trim() || null, doneAt: now, doneBy: actor.userId }).where(eq(schema.verificationTasks.id, task.id));
    await tx.insert(schema.events).values({ groupId: task.groupId, propertyId: task.propertyId, entityType: "issue", entityId: task.issueId, type: "verification.skipped", actor: actor.userId, payload: { task_id: task.id, reason: input.reason?.trim() || null } });
  });
}

/** This issue's tasks, for the Outcomes tab. */
export async function listIssueVerifications(db: Db, ctx: TenantContext, issueId: string): Promise<VerificationRow[]> {
  return withTenant(db, ctx, async (tx) => {
    const rows = await tx.execute<Raw>(sql`${SELECT} where v.issue_id = ${issueId} order by v.due_at`);
    return rows.map(toRow);
  });
}
