import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, schema, type Db } from "../index";
import { dataDir } from "../scripts/lib/paths";
import { findProperty } from "../scripts/seed";
import { evaluateLinking, formatLinkReport, type LinkReport } from "@/link/eval";
import { linkSignals, type LinkResult } from "@/link/pipeline";
import { createFakeLlm } from "@/normalize/llm";
import { TEST_URL } from "./env";

let db: Db;
let propertyId: string;
let result: LinkResult;
let report: LinkReport;

beforeAll(async () => {
  db = createDb(TEST_URL, { max: 2 });
  const p = await findProperty(db);
  if (!p) throw new Error("seed missing");
  propertyId = p.id;
  result = await linkSignals(db, { llm: createFakeLlm() });
  report = await evaluateLinking(db, propertyId, dataDir());
  console.log("\n" + formatLinkReport(report) + "\n");
});

afterAll(async () => {
  await db.$client.end();
});

describe("linking engine (rules + fake judge)", () => {
  it("groups the planted signals with high precision and recall", () => {
    expect(report.pairs.precision).toBeGreaterThan(0.9);
    expect(report.pairs.recall).toBeGreaterThan(0.7);
    // The same-topic-next-door and other-wing decoys stay out, bar a couple.
    expect(report.distractorsLinked.n).toBeLessThanOrEqual(3);
  });

  it("finds the planted issues, including every shared-cause cluster", () => {
    expect(report.issues.found).toBeGreaterThanOrEqual(38);
    expect(report.issues.byScenario.shared_cause_cluster.found).toBeGreaterThanOrEqual(9);
    expect(report.issues.byScenario.same_room_repeat.found).toBeGreaterThanOrEqual(9);
    expect(report.issues.byScenario.cross_room_leak.found).toBe(2);
  });

  it("agrees with the key on recurrence, fix held and root-cause location for most found issues", () => {
    const a = report.agreement;
    expect(a.recurred.correct / a.recurred.n).toBeGreaterThan(0.7);
    expect(a.fixHeld.correct / a.fixHeld.n).toBeGreaterThan(0.7);
    expect(a.rootCause.correct / a.rootCause.n).toBeGreaterThan(0.7);
  });

  it("never turns routine maintenance into an issue", async () => {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.issueSignals)
      .innerJoin(schema.signals, eq(schema.signals.id, schema.issueSignals.signalId))
      .where(sql`${schema.issueSignals.propertyId} = ${propertyId} and ${schema.signals.topic} = 'preventive'`);
    expect(n).toBe(0);
  });

  it("writes consistent derived rows: one primary per issue, tickets as actions, reopen outcomes", async () => {
    const [{ issues }] = await db.select({ issues: sql<number>`count(*)::int` }).from(schema.issues).where(eq(schema.issues.propertyId, propertyId));
    expect(issues).toBe(result.issues);
    const [{ primaries }] = await db
      .select({ primaries: sql<number>`count(*)::int` })
      .from(schema.issueSignals)
      .where(sql`${schema.issueSignals.propertyId} = ${propertyId} and ${schema.issueSignals.role} = 'primary'`);
    expect(primaries).toBe(result.issues);
    const [{ tickets }] = await db
      .select({ tickets: sql<number>`count(*)::int` })
      .from(schema.actions)
      .where(sql`${schema.actions.propertyId} = ${propertyId} and ${schema.actions.kind} = 'ticket_created'`);
    expect(tickets).toBeGreaterThan(500);
    const [{ reopened }] = await db
      .select({ reopened: sql<number>`count(*)::int` })
      .from(schema.outcomes)
      .where(sql`${schema.outcomes.propertyId} = ${propertyId} and ${schema.outcomes.kind} = 'recurred'`);
    expect(reopened).toBeGreaterThan(10);
  });

  it("rebuilds to the same result on a second run", async () => {
    const again = await linkSignals(db, { llm: createFakeLlm() });
    expect(again.issues).toBe(result.issues);
    expect(again.accepted).toBe(result.accepted);
    const [{ links }] = await db.select({ links: sql<number>`count(*)::int` }).from(schema.issueSignals).where(eq(schema.issueSignals.propertyId, propertyId));
    const [{ issues }] = await db.select({ issues: sql<number>`count(*)::int` }).from(schema.issues).where(eq(schema.issues.propertyId, propertyId));
    expect(issues).toBe(result.issues);
    expect(links).toBeGreaterThan(result.issues);
  });
});
