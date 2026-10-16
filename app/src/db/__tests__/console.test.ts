import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, schema, type Db, type TenantContext } from "../index";
import { findProperty } from "../scripts/seed";
import { applyLinkDecision } from "@/console/decisions";
import { countIssues, getIssue, getKpis, listIssues } from "@/console/queries";
import { linkSignals } from "@/link/pipeline";
import { createFakeLlm } from "@/normalize/llm";
import { TEST_APP_URL, TEST_URL } from "./env";

let admin: Db;
let app: Db;
let ctx: TenantContext;

beforeAll(async () => {
  admin = createDb(TEST_URL, { max: 2 });
  app = createDb(TEST_APP_URL, { max: 2 });
  const p = await findProperty(admin);
  if (!p) throw new Error("seed missing");
  ctx = { groupId: p.groupId, propertyIds: [p.id] };
  await admin.delete(schema.linkDecisions).where(eq(schema.linkDecisions.propertyId, p.id));
  await linkSignals(admin, { llm: createFakeLlm() });
});

afterAll(async () => {
  await app.$client.end();
  await admin.$client.end();
});

describe("console read models (through the app role and RLS)", () => {
  it("lists issues ranked by what came back, with counts per filter", async () => {
    const { rows, total } = await listIssues(app, ctx, "all", 20);
    expect(total).toBeGreaterThan(500);
    expect(rows.length).toBe(20);
    expect(rows[0].signals).toBeGreaterThanOrEqual(rows[1].signals - 50);
    expect(rows.every((r) => r.signals >= 1 && r.firstAt <= r.lastAt)).toBe(true);
    const reopened = await listIssues(app, ctx, "reopened", 50);
    expect(reopened.rows.every((r) => r.status === "reopened" || r.reopenCount > 0)).toBe(true);
    const counts = await countIssues(app, ctx);
    expect(counts.all).toBe(total);
    expect(counts.reopened).toBe(reopened.total);
    expect(counts.clusters).toBeGreaterThan(5);
  });

  it("computes the headline figures", async () => {
    const k = await getKpis(app, ctx);
    expect(k.withClosure).toBeGreaterThan(100);
    expect(k.reopenRate).not.toBeNull();
    expect(k.repeats).toBeGreaterThan(10);
    expect(k.roomNights).toBeGreaterThan(10_000);
    expect(k.repeatsPerThousandRoomNights).toBeGreaterThan(0);
    expect(k.medianHoursToResolve).toBeGreaterThan(0);
    expect(k.byCategory.length).toBeGreaterThan(3);
  });

  it("returns an issue with its evidence in time order, tickets and outcomes", async () => {
    const { rows } = await listIssues(app, ctx, "reopened", 1);
    const issue = await getIssue(app, ctx, rows[0].id);
    expect(issue).not.toBeNull();
    expect(issue!.signals.length).toBe(rows[0].signals);
    expect(issue!.signals.filter((s) => s.role === "primary").length).toBe(1);
    for (let i = 1; i < issue!.signals.length; i++) {
      expect(issue!.signals[i].occurredAt >= issue!.signals[i - 1].occurredAt).toBe(true);
    }
    expect(issue!.actions.length).toBeGreaterThan(0);
    expect(issue!.outcomes.some((o) => o.kind === "recurred")).toBe(true);
    expect(await getIssue(app, ctx, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});

describe("supervisor decisions survive a rebuild", () => {
  it("rejecting a link removes the signal now and keeps it out after re-linking", async () => {
    const { rows } = await listIssues(app, ctx, "reopened", 5);
    const target = rows.find((r) => r.signals >= 4)!;
    const before = (await getIssue(app, ctx, target.id))!;
    const victim = before.signals.find((s) => s.role === "supporting")!;

    const res = await applyLinkDecision(app, ctx, { issueId: target.id, signalId: victim.id, decision: "reject", decidedBy: "test-supervisor" });
    expect(res.removed).toBe(true);
    expect(res.pinned).toBe(before.signals.length - 1);
    const after = (await getIssue(app, ctx, target.id))!;
    expect(after.signals.map((s) => s.id)).not.toContain(victim.id);

    await linkSignals(admin, { llm: createFakeLlm() });
    const survivors = before.signals.filter((s) => s.id !== victim.id).map((s) => s.id);
    const [{ together }] = await admin
      .select({ together: sql<number>`count(distinct ${schema.issueSignals.issueId})::int` })
      .from(schema.issueSignals)
      .where(and(eq(schema.issueSignals.propertyId, ctx.propertyIds[0]), sql`${schema.issueSignals.signalId} in (${sql.join(survivors.map((id) => sql`${id}`), sql`, `)})`));
    const [victimRow] = await admin
      .select({ issueId: schema.issueSignals.issueId })
      .from(schema.issueSignals)
      .where(eq(schema.issueSignals.signalId, victim.id));
    const [survivorRow] = await admin
      .select({ issueId: schema.issueSignals.issueId })
      .from(schema.issueSignals)
      .where(eq(schema.issueSignals.signalId, survivors[0]));
    expect(together).toBeGreaterThanOrEqual(1);
    expect(victimRow?.issueId ?? null).not.toBe(survivorRow.issueId);
    const events = await admin
      .select({ type: schema.events.type, actor: schema.events.actor })
      .from(schema.events)
      .where(eq(schema.events.type, "issue.link_rejected"));
    expect(events.some((e) => e.actor === "test-supervisor")).toBe(true);
  });

  it("confirming a link marks it human and pins it to the first report", async () => {
    const { rows } = await listIssues(app, ctx, "reopened", 5);
    const target = rows.find((r) => r.signals >= 3)!;
    const issue = (await getIssue(app, ctx, target.id))!;
    const supporting = issue.signals.find((s) => s.role === "supporting" && s.method !== "human")!;
    const res = await applyLinkDecision(app, ctx, { issueId: target.id, signalId: supporting.id, decision: "confirm", decidedBy: "test-supervisor" });
    expect(res.pinned).toBe(1);
    const after = (await getIssue(app, ctx, target.id))!;
    const row = after.signals.find((s) => s.id === supporting.id)!;
    expect(row.method).toBe("human");
    expect(row.decidedBy).toBe("test-supervisor");
    expect(row.confidence).toBe(1);
    const pins = await admin.select({ decision: schema.linkDecisions.decision }).from(schema.linkDecisions).where(eq(schema.linkDecisions.decision, "link"));
    expect(pins.length).toBeGreaterThanOrEqual(1);
  });
});
