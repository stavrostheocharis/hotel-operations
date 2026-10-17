import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, schema, type Db, type TenantContext } from "../index";
import { findProperty } from "../scripts/seed";
import { AuthorizationError, type Actor } from "@/auth/permissions";
import { listAssignableUsers } from "@/console/issue-detail";
import { getIssue } from "@/console/queries";
import { countPendingPairs, decidePair, listDecidedPairs, listReviewPairs, undoPairDecision } from "@/console/review";
import { countSignalViews, getSignal, listSignals, searchIssues, suggestIssuesForSignal } from "@/console/signals";
import { linkSignals } from "@/link/pipeline";
import { createFakeLlm } from "@/normalize/llm";
import { normalizeSignals } from "@/normalize/pipeline";
import { TEST_APP_URL, TEST_URL } from "./env";

let admin: Db;
let app: Db;
let ctx: TenantContext;
let propertyId: string;
let gm: Actor;
let staff: Actor;
const TZ = "Europe/Athens";

beforeAll(async () => {
  admin = createDb(TEST_URL, { max: 2 });
  app = createDb(TEST_APP_URL, { max: 2 });
  const p = await findProperty(admin);
  if (!p) throw new Error("seed missing");
  ctx = { groupId: p.groupId, propertyIds: [p.id] };
  propertyId = p.id;
  await admin.delete(schema.linkDecisions).where(eq(schema.linkDecisions.propertyId, p.id));
  // Rules only: the unsure pairs stay for a person.
  await linkSignals(admin, {});
  const users = await listAssignableUsers(app, ctx, p.id);
  gm = { userId: users.find((u) => u.role === "gm")!.id, role: "gm", department: "management" };
  staff = { userId: users.find((u) => u.role === "staff")!.id, role: "staff", department: "engineering" };
});

afterAll(async () => {
  await app.$client.end();
  await admin.$client.end();
});

describe("the signals inbox", () => {
  it("lists records newest first with their issue, counts the views, and searches", async () => {
    const all = await listSignals(app, ctx, { view: "all", timeZone: TZ });
    expect(all.total).toBeGreaterThan(4000);
    for (let i = 1; i < all.rows.length; i++) expect(all.rows[i - 1].occurredAt.getTime()).toBeGreaterThanOrEqual(all.rows[i].occurredAt.getTime());
    const counts = await countSignalViews(app, ctx, { timeZone: TZ });
    expect(counts.all).toBe(all.total);
    expect(counts.unlinked).toBeGreaterThan(0);
    expect(counts.unlinked).toBeLessThan(counts.all);
    const unlinked = await listSignals(app, ctx, { view: "unlinked", timeZone: TZ });
    expect(unlinked.rows.every((r) => r.issueId === null && r.category !== null)).toBe(true);
    const tickets = await listSignals(app, ctx, { view: "all", timeZone: TZ, source: "work_order" });
    expect(tickets.rows.every((r) => r.source === "work_order")).toBe(true);
    const byId = await listSignals(app, ctx, { view: "all", timeZone: TZ, q: tickets.rows[0].externalId });
    expect(byId.rows.some((r) => r.id === tickets.rows[0].id)).toBe(true);
    const greek = await listSignals(app, ctx, { view: "all", timeZone: TZ, nonEnglish: true });
    expect(greek.rows.every((r) => r.language && r.language !== "en")).toBe(true);
  });

  it("shows a record in full and suggests likely issues", async () => {
    const linked = (await listSignals(app, ctx, { view: "all", timeZone: TZ, source: "front_desk" })).rows.find((r) => r.issueId)!;
    const rec = (await getSignal(app, ctx, linked.id))!;
    expect(rec.issues.length).toBeGreaterThanOrEqual(1);
    expect(rec.raw).toBeTypeOf("object");
    expect(rec.lockedFields).toEqual([]);
    const unlinked = (await listSignals(app, ctx, { view: "unlinked", timeZone: TZ })).rows[0];
    const rec2 = (await getSignal(app, ctx, unlinked.id))!;
    const suggestions = await suggestIssuesForSignal(app, ctx, rec2);
    expect(suggestions.length).toBeLessThanOrEqual(8);
    expect(suggestions.every((s) => s.reason.length > 0)).toBe(true);
    const found = await searchIssues(app, ctx, "boiler");
    expect(found.length).toBeGreaterThan(0);
  });

  it("keeps hand-set fields through normalisation", async () => {
    // The normaliser pages by id, so a low id is reached within the limit below.
    const [row] = await admin.execute<{ id: string; category: string }>(
      sql`select id, category from signals where property_id = ${propertyId} and source = 'front_desk' and category is not null and category <> 'pest' order by id limit 1`,
    );
    await admin
      .update(schema.signals)
      .set({ category: "pest", topic: "mosquitoes", lockedFields: ["category", "topic"] })
      .where(eq(schema.signals.id, row.id));
    await normalizeSignals(admin, { llm: createFakeLlm(), all: true, limit: 3000 });
    const [after] = await admin.select({ category: schema.signals.category, topic: schema.signals.topic }).from(schema.signals).where(eq(schema.signals.id, row.id));
    expect(after.category).toBe("pest");
    expect(after.topic).toBe("mosquitoes");
    await admin.update(schema.signals).set({ lockedFields: [] }).where(eq(schema.signals.id, row.id));
    await normalizeSignals(admin, { llm: createFakeLlm(), all: true, limit: 3000 });
    const [reset] = await admin.select({ category: schema.signals.category }).from(schema.signals).where(eq(schema.signals.id, row.id));
    expect(reset.category).toBe(row.category);
  });
});

describe("the review queue", () => {
  it("is fed by the linker and answered by a person, with the pin surviving a rebuild", async () => {
    const pending = await countPendingPairs(app, ctx);
    expect(pending).toBeGreaterThan(0);
    const { pairs, total } = await listReviewPairs(app, ctx, { limit: 3 });
    expect(total).toBe(pending);
    expect(pairs.length).toBeGreaterThan(0);
    const pair = pairs[0];
    expect(pair.a.id).not.toBe(pair.b.id);
    expect(pair.score).toBeGreaterThan(0);

    await expect(decidePair(app, ctx, staff, { suggestionId: pair.id, verdict: "same" })).rejects.toBeInstanceOf(AuthorizationError);
    await decidePair(app, ctx, gm, { suggestionId: pair.id, verdict: "different" });
    expect(await countPendingPairs(app, ctx)).toBe(pending - 1);
    const [pin] = await admin
      .select({ decision: schema.linkDecisions.decision })
      .from(schema.linkDecisions)
      .where(and(eq(schema.linkDecisions.propertyId, propertyId), eq(schema.linkDecisions.signalA, pair.a.id < pair.b.id ? pair.a.id : pair.b.id)));
    expect(pin?.decision).toBe("unlink");

    const recent = await listDecidedPairs(app, ctx);
    expect(recent.some((d) => d.id === pair.id && d.decision === "rejected")).toBe(true);

    // The rebuild rewrites the pending queue but keeps the decision and the pin,
    // and never asks about that pair again.
    await linkSignals(admin, {});
    const [{ n }] = await admin.execute<{ n: number }>(sql`select count(*)::int as n from ai_suggestions where id = ${pair.id} and decision = 'rejected'`);
    expect(n).toBe(1);
    const [{ asked }] = await admin.execute<{ asked: number }>(sql`
      select count(*)::int as asked from ai_suggestions
      where kind = 'link' and decision = 'pending' and property_id = ${propertyId}
        and input_refs->'signal_ids' ? ${pair.a.id} and input_refs->'signal_ids' ? ${pair.b.id}
    `);
    expect(asked).toBe(0);

    await undoPairDecision(app, ctx, gm, { suggestionId: pair.id });
    expect(await countPendingPairs(app, ctx)).toBeGreaterThanOrEqual(1);
    const pins = await admin.select().from(schema.linkDecisions).where(and(eq(schema.linkDecisions.propertyId, propertyId), eq(schema.linkDecisions.signalA, pair.a.id < pair.b.id ? pair.a.id : pair.b.id)));
    expect(pins.length).toBe(0);
  });

  it("same with one side in an issue attaches the other at once; skip sends the pair to the back", async () => {
    const { pairs } = await listReviewPairs(app, ctx, { limit: 50 });
    const oneSide = pairs.find((p) => (p.a.issueId && !p.b.issueId) || (!p.a.issueId && p.b.issueId));
    if (oneSide) {
      const res = await decidePair(app, ctx, gm, { suggestionId: oneSide.id, verdict: "same" });
      expect(res.attachedIssueId).toBe(oneSide.a.issueId ?? oneSide.b.issueId);
      const loose = oneSide.a.issueId ? oneSide.b.id : oneSide.a.id;
      const issue = (await getIssue(app, ctx, res.attachedIssueId!))!;
      expect(issue.signals.some((s) => s.id === loose && s.method === "human")).toBe(true);
      // and the rebuild keeps the person's link
      await linkSignals(admin, {});
      const again = (await getIssue(app, ctx, res.attachedIssueId!))!;
      expect(again.signals.some((s) => s.id === loose)).toBe(true);
    }
    const before = await listReviewPairs(app, ctx, { limit: 1 });
    await decidePair(app, ctx, gm, { suggestionId: before.pairs[0].id, verdict: "skip" });
    const after = await listReviewPairs(app, ctx, { limit: 1 });
    expect(after.total).toBe(before.total);
    if (before.total > 1) expect(after.pairs[0].id).not.toBe(before.pairs[0].id);
  });
});
