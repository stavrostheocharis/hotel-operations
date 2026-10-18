import { eq, isNull, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, schema, type Db } from "../index";
import { dataDir } from "../scripts/lib/paths";
import { findProperty } from "../scripts/seed";
import { evaluateNormalization, formatReport, type EvalReport } from "@/normalize/eval";
import { createFakeLlm } from "@/normalize/llm";
import { normalizeSignals, resetNormalization, type NormalizeResult } from "@/normalize/pipeline";
import { TEST_URL } from "./env";

let db: Db;
let propertyId: string;
let result: NormalizeResult;
let report: EvalReport;
let since: Date;

beforeAll(async () => {
  db = createDb(TEST_URL, { max: 2 });
  const p = await findProperty(db);
  if (!p) throw new Error("seed missing");
  propertyId = p.id;
  // The global setup already normalised everything; start from scratch here.
  await resetNormalization(db, propertyId);
  await db.delete(schema.aiSuggestions).where(eq(schema.aiSuggestions.propertyId, propertyId));
  since = new Date();
  result = await normalizeSignals(db, { llm: createFakeLlm() });
  report = await evaluateNormalization(db, propertyId, dataDir());
  console.log("\n" + formatReport(report) + "\n");
});

afterAll(async () => {
  await db.$client.end();
});

const acc = (s: { correct: number; n: number }) => (s.n ? s.correct / s.n : 0);

describe("normalisation pipeline (rules + fake LLM)", () => {
  it("processes every signal once and stamps normalized_at", async () => {
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(schema.signals)
      .where(eq(schema.signals.propertyId, propertyId));
    expect(result.processed).toBe(total);
    const [{ open }] = await db
      .select({ open: sql<number>`count(*)::int` })
      .from(schema.signals)
      .where(sql`${schema.signals.propertyId} = ${propertyId} and ${isNull(schema.signals.normalizedAt)}`);
    expect(open).toBe(0);
  });

  it("writes a signal.normalized event per signal and per run", async () => {
    const [{ thisRun }] = await db
      .select({ thisRun: sql<number>`count(*)::int` })
      .from(schema.events)
      .where(sql`${schema.events.propertyId} = ${propertyId} and ${schema.events.type} = 'signal.normalized' and ${schema.events.occurredAt} >= ${since.toISOString()}::timestamptz`);
    expect(thisRun).toBe(result.processed);
    // Earlier runs (the global setup, other test files) keep their events.
    const [{ all }] = await db
      .select({ all: sql<number>`count(*)::int` })
      .from(schema.events)
      .where(sql`${schema.events.propertyId} = ${propertyId} and ${schema.events.type} = 'signal.normalized'`);
    expect(all).toBeGreaterThanOrEqual(result.processed * 2);
  });

  it("detects the language of guest and staff text", () => {
    expect(acc(report.all.language)).toBeGreaterThan(0.9);
    expect(acc(report.review.language)).toBeGreaterThan(0.95);
  });

  it("resolves locations: typed fields by rules, surveys through the stay, reviews only when explicit", () => {
    expect(acc(report.work_order.location)).toBeGreaterThan(0.85);
    expect(acc(report.front_desk.location)).toBeGreaterThan(0.9);
    expect(acc(report.survey.location)).toBeGreaterThan(0.9);
    // Reviews almost never name the room; a guess is worse than a gap.
    const r = report.review.location;
    expect(r.predicted / r.n).toBeLessThan(0.2);
    expect(r.predicted === 0 || r.correct / r.predicted > 0.5).toBe(true);
  });

  it("classifies tickets and complaints well above the drop-down baseline", () => {
    expect(acc(report.work_order.category)).toBeGreaterThan(0.75);
    expect(acc(report.front_desk.category)).toBeGreaterThan(0.75);
    expect(acc(report.survey.category)).toBeGreaterThan(0.8);
    expect(acc(report.review.category)).toBeGreaterThan(0.7);
  });

  it("hands non-English text to the translation stage and records the suggestion", async () => {
    expect(result.translated).toBeGreaterThan(500);
    const [row] = await db
      .select({ textEn: schema.signals.textEn, language: schema.signals.language })
      .from(schema.signals)
      .where(sql`${schema.signals.propertyId} = ${propertyId} and ${schema.signals.language} = 'de'`)
      .limit(1);
    expect(row.textEn).toMatch(/^\[de→en\]/);
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.aiSuggestions)
      .where(sql`${schema.aiSuggestions.propertyId} = ${propertyId} and ${schema.aiSuggestions.kind} = 'translate'`);
    expect(n).toBe(result.translated);
  });

  it("does nothing on a second run", async () => {
    const again = await normalizeSignals(db, { llm: createFakeLlm() });
    expect(again.processed).toBe(0);
  });
});
