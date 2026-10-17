import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, schema, type Db, type TenantContext } from "../index";
import { findProperty } from "../scripts/seed";
import { AuthorizationError, type Actor } from "@/auth/permissions";
import { listAssignableUsers } from "@/console/issue-detail";
import { assignIssue, resolveIssue } from "@/console/issue-workflow";
import { countIssueViews, getIssue, queryIssues } from "@/console/queries";
import { getTodayDigest } from "@/console/today";
import { completeVerification, countDueToday, countVerificationViews, listIssueVerifications, listVerifications, scheduleVerification, skipVerification } from "@/console/verification";
import { linkSignals } from "@/link/pipeline";
import { createFakeLlm } from "@/normalize/llm";
import { TEST_APP_URL, TEST_URL } from "./env";

let admin: Db;
let app: Db;
let ctx: TenantContext;
let gm: Actor;
let staff: Actor;
let staffUserId: string;
const TZ = "Europe/Athens";

beforeAll(async () => {
  admin = createDb(TEST_URL, { max: 2 });
  app = createDb(TEST_APP_URL, { max: 2 });
  const p = await findProperty(admin);
  if (!p) throw new Error("seed missing");
  ctx = { groupId: p.groupId, propertyIds: [p.id] };
  await admin.delete(schema.linkDecisions).where(eq(schema.linkDecisions.propertyId, p.id));
  await linkSignals(admin, { llm: createFakeLlm() });
  const users = await listAssignableUsers(app, ctx, p.id);
  const g = users.find((u) => u.role === "gm")!;
  const s = users.find((u) => u.role === "staff")!;
  gm = { userId: g.id, role: "gm", department: "management" };
  staff = { userId: s.id, role: "staff", department: "engineering" };
  staffUserId = s.id;
});

afterAll(async () => {
  await app.$client.end();
  await admin.$client.end();
});

const dayAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

describe("the exceptions queue", () => {
  it("answers the views with consistent counts, searches by room and ticket, and pages", async () => {
    const counts = await countIssueViews(app, ctx, {});
    expect(counts.all).toBeGreaterThan(500);
    expect(counts.attention).toBeGreaterThan(0);
    expect(counts.open + counts.awaiting + counts.closed).toBe(counts.all);
    const attention = await queryIssues(app, ctx, { view: "attention" });
    expect(attention.total).toBe(counts.attention);
    expect(attention.rows.length).toBeLessThanOrEqual(25);
    expect(attention.rows.every((r) => r.status === "reopened" || (r.status === "detected" && !r.ownerUserId) || r.status === "resolved")).toBe(true);
    const page2 = await queryIssues(app, ctx, { view: "all", page: 2 });
    expect(page2.page).toBe(2);
    expect(page2.rows[0].id).not.toBe((await queryIssues(app, ctx, { view: "all" })).rows[0].id);

    const byRoom = await queryIssues(app, ctx, { view: "all", q: "C-BOILER" });
    expect(byRoom.rows.some((r) => r.locationCode === "C-BOILER")).toBe(true);
    const anyIssue = (await queryIssues(app, ctx, { view: "all", sort: "most_reports" })).rows[0];
    const detail = (await getIssue(app, ctx, anyIssue.id))!;
    const ticket = detail.signals.find((s) => s.source === "work_order");
    if (ticket) {
      const byTicket = await queryIssues(app, ctx, { view: "all", q: ticket.externalId });
      expect(byTicket.rows.some((r) => r.id === anyIssue.id)).toBe(true);
    }
    const critical = await queryIssues(app, ctx, { view: "all", critical: true });
    expect(critical.rows.every((r) => r.severity === "high" || r.severity === "critical")).toBe(true);
    const sorted = await queryIssues(app, ctx, { view: "all", sort: "newest" });
    for (let i = 1; i < sorted.rows.length; i++) expect(sorted.rows[i - 1].lastActivityAt.getTime()).toBeGreaterThanOrEqual(0);
  });
});

describe("verification tasks", () => {
  it("resolving with a check schedules it for the owner, and it shows up as due", async () => {
    const target = (await queryIssues(app, ctx, { view: "open" })).rows.find((r) => r.status === "detected")!;
    await assignIssue(app, ctx, gm, { issueId: target.id, ownerUserId: staffUserId, department: "engineering" });
    await resolveIssue(app, ctx, gm, { issueId: target.id, note: "Valve replaced." });
    const { id } = await scheduleVerification(app, ctx, gm, { issueId: target.id, dueAt: dayAgo(1), instructions: "Run the shower for five minutes." });
    const tasks = await listIssueVerifications(app, ctx, target.id);
    expect(tasks.map((t) => t.id)).toContain(id);
    expect(tasks[0].assigneeUserId).toBe(staffUserId);
    const due = await listVerifications(app, ctx, { view: "due", now: new Date(), timeZone: TZ, userId: gm.userId });
    expect(due.rows.some((t) => t.id === id)).toBe(true);
    const mine = await listVerifications(app, ctx, { view: "mine", now: new Date(), timeZone: TZ, userId: staffUserId });
    expect(mine.rows.some((t) => t.id === id)).toBe(true);
    expect(await countDueToday(app, ctx, TZ)).toBeGreaterThanOrEqual(1);
    const counts = await countVerificationViews(app, ctx, { timeZone: TZ, userId: staffUserId });
    expect(counts.mine).toBeGreaterThanOrEqual(1);
    expect(counts.open).toBeGreaterThanOrEqual(counts.due);
    const digest = await getTodayDigest(app, ctx, { timeZone: TZ, userId: gm.userId });
    expect(digest.verificationsDue.total).toBeGreaterThanOrEqual(1);
    expect(digest.cameBack.total).toBeGreaterThanOrEqual(0);
    expect(digest.unassigned.rows.every((i) => i.ownerName === null)).toBe(true);
  });

  it("completing a check as held verifies the issue; the assignee may do it, a stranger may not", async () => {
    const target = (await queryIssues(app, ctx, { view: "open" })).rows.find((r) => r.status === "detected")!;
    await resolveIssue(app, ctx, gm, { issueId: target.id, note: "Done." });
    const { id } = await scheduleVerification(app, ctx, gm, { issueId: target.id, dueAt: new Date(), assigneeUserId: staffUserId });
    const other: Actor = { userId: "00000000-0000-0000-0000-000000000001", role: "staff", department: "engineering" };
    await expect(completeVerification(app, ctx, other, { taskId: id, result: "staff_evidence" })).rejects.toBeInstanceOf(AuthorizationError);
    const res = await completeVerification(app, ctx, staff, { taskId: id, result: "staff_evidence", note: "Checked, fine." });
    expect(res.status).toBe("done");
    expect(res.issueStatus).toBe("verified");
    const issue = (await getIssue(app, ctx, target.id))!;
    expect(issue.status).toBe("verified");
    expect(issue.outcomes.some((o) => o.kind === "staff_evidence")).toBe(true);
    const [task] = await listIssueVerifications(app, ctx, target.id);
    expect(task.status).toBe("done");
    expect(task.result).toBe("staff_evidence");
    await expect(completeVerification(app, ctx, staff, { taskId: id, result: "recurred" })).rejects.toThrow(/closed/);
  });

  it("came back reopens; could-not moves the date; skip closes without an outcome", async () => {
    const targets = (await queryIssues(app, ctx, { view: "open" })).rows.filter((r) => r.status === "detected").slice(0, 2);
    for (const tgt of targets) await resolveIssue(app, ctx, gm, { issueId: tgt.id, note: "Fixed." });
    const a = await scheduleVerification(app, ctx, gm, { issueId: targets[0].id, dueAt: new Date() });
    const moved = await completeVerification(app, ctx, gm, { taskId: a.id, result: "could_not", note: "Room occupied.", rescheduleTo: new Date(Date.now() + 3 * 86_400_000) });
    expect(moved.status).toBe("open");
    const [t0] = await listIssueVerifications(app, ctx, targets[0].id);
    expect(t0.dueAt.getTime()).toBeGreaterThan(Date.now() + 2 * 86_400_000);
    const back = await completeVerification(app, ctx, gm, { taskId: a.id, result: "recurred", note: "Cold again." });
    expect(back.issueStatus).toBe("reopened");
    expect((await getIssue(app, ctx, targets[0].id))!.status).toBe("reopened");

    const b = await scheduleVerification(app, ctx, gm, { issueId: targets[1].id, dueAt: new Date() });
    await expect(skipVerification(app, ctx, staff, { taskId: b.id })).rejects.toBeInstanceOf(AuthorizationError);
    await skipVerification(app, ctx, gm, { taskId: b.id, reason: "Guest checked out." });
    const [t1] = await listIssueVerifications(app, ctx, targets[1].id);
    expect(t1.status).toBe("skipped");
    expect((await getIssue(app, ctx, targets[1].id))!.status).toBe("resolved");
  });

  it("survives a linking run and stays behind row-level security", async () => {
    const before = await listVerifications(app, ctx, { view: "open", now: new Date(), timeZone: TZ, userId: gm.userId });
    await linkSignals(admin, { llm: createFakeLlm() });
    const after = await listVerifications(app, ctx, { view: "open", now: new Date(), timeZone: TZ, userId: gm.userId });
    expect(after.total).toBe(before.total);
    // The app role sees nothing without a tenant context.
    const bare = await app.select().from(schema.verificationTasks).limit(1);
    expect(bare.length).toBe(0);
  });
});
