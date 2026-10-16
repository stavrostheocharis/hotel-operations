import { eq } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { schema, type Db } from "@/db";

/**
 * Score the normalised signals against the synthetic answer key. Only for
 * data/out; real exports have no key. Reports per source so a weak stage is
 * visible (reviews rarely carry a room; surveys reach one through the stay).
 */

type KeySignal = {
  signal_id: string;
  source_file: string;
  record_id: string;
  true_location: string | null;
  true_location_type: string | null;
  true_category: string | null;
  topic: string | null;
  language: string | null;
};

const SOURCE_BY_FILE: Record<string, string> = {
  "work_orders.csv": "work_order",
  "front_desk_log.xlsx": "front_desk",
  "surveys.csv": "survey",
  "reviews.json": "review",
};

export type SourceScore = {
  n: number;
  language: { n: number; correct: number };
  location: { n: number; correct: number; predicted: number };
  category: { n: number; correct: number };
  topic: { n: number; correct: number };
};

export type EvalReport = Record<string, SourceScore> & { all: SourceScore };

export async function evaluateNormalization(
  db: Db,
  propertyId: string,
  dataDir: string,
): Promise<EvalReport> {
  const key = JSON.parse(await readFile(path.join(dataDir, "answer_key.json"), "utf8")) as {
    signals: KeySignal[];
  };
  const locations = await db
    .select({ id: schema.locations.id, code: schema.locations.code })
    .from(schema.locations)
    .where(eq(schema.locations.propertyId, propertyId));
  const codeOf = new Map(locations.map((l) => [l.id, l.code]));

  const rows = await db
    .select({
      source: schema.signals.source,
      externalId: schema.signals.externalId,
      language: schema.signals.language,
      locationId: schema.signals.locationId,
      category: schema.signals.category,
      topic: schema.signals.topic,
      textOriginal: schema.signals.textOriginal,
    })
    .from(schema.signals)
    .where(eq(schema.signals.propertyId, propertyId));
  const bySignal = new Map(rows.map((r) => [`${r.source}:${r.externalId}`, r]));

  const fresh = (): SourceScore => ({
    n: 0,
    language: { n: 0, correct: 0 },
    location: { n: 0, correct: 0, predicted: 0 },
    category: { n: 0, correct: 0 },
    topic: { n: 0, correct: 0 },
  });
  const report = { all: fresh() } as EvalReport;

  for (const k of key.signals) {
    const source = SOURCE_BY_FILE[k.source_file];
    if (!source) continue;
    const row = bySignal.get(`${source}:${k.record_id}`);
    if (!row) continue;
    report[source] ??= fresh();
    for (const bucket of [report[source], report.all]) {
      bucket.n++;
      if (k.language && row.textOriginal && row.textOriginal.length >= 12) {
        bucket.language.n++;
        if (sameLanguage(row.language, k.language)) bucket.language.correct++;
      }
      bucket.location.n++;
      const predicted = row.locationId ? codeOf.get(row.locationId) ?? null : null;
      if (predicted) bucket.location.predicted++;
      if (predicted && k.true_location && predicted.toUpperCase() === k.true_location.toUpperCase()) {
        bucket.location.correct++;
      }
      bucket.category.n++;
      if (norm(row.category) === norm(k.true_category)) bucket.category.correct++;
      bucket.topic.n++;
      if (norm(row.topic) === norm(k.topic)) bucket.topic.correct++;
    }
  }
  return report;
}

function norm(v: string | null | undefined): string | null {
  if (!v || v === "none") return null;
  return v;
}

function sameLanguage(predicted: string | null, truth: string): boolean {
  if (!predicted) return false;
  const t = truth === "gr" ? "el-latn" : truth;
  return predicted === t;
}

export function formatReport(report: EvalReport): string {
  const pct = (c: number, n: number) => (n ? `${((100 * c) / n).toFixed(1)}%` : "n/a");
  const lines = [
    "source       n     language   location acc / coverage / precision   category   topic",
  ];
  for (const [source, s] of Object.entries(report)) {
    lines.push(
      `${source.padEnd(12)} ${String(s.n).padStart(5)}  ${pct(s.language.correct, s.language.n).padStart(8)}   ${pct(s.location.correct, s.location.n).padStart(7)} / ${pct(s.location.predicted, s.location.n).padStart(7)} / ${pct(s.location.correct, s.location.predicted).padStart(7)}       ${pct(s.category.correct, s.category.n).padStart(7)}   ${pct(s.topic.correct, s.topic.n).padStart(7)}`,
    );
  }
  return lines.join("\n");
}
