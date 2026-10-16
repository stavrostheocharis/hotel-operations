import { eq } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { schema, type Db } from "@/db";

/**
 * Score the linker against the synthetic answer key: pairwise precision /
 * recall over the planted signals (a distractor linked to its issue is a
 * false positive, a duplicate counts for nothing), how many of the 42
 * planted issues were found per scenario, and whether recurrence, fix-held
 * and the root-cause location agree on the issues that were found.
 */

type KeySignal = { signal_id: string; source_file: string; record_id: string; issue_id: string | null; role: string };
type KeyIssue = {
  issue_id: string;
  scenario: string;
  recurred: boolean;
  fix_held: boolean | null;
  root_cause: { location: string };
  status_at_season_end: string;
  signal_ids: string[];
};

const SOURCE_BY_FILE: Record<string, string> = {
  "work_orders.csv": "work_order",
  "front_desk_log.xlsx": "front_desk",
  "surveys.csv": "survey",
  "reviews.json": "review",
};

export type LinkReport = {
  pairs: { tp: number; fp: number; fn: number; distractorFp: number; precision: number; recall: number; f1: number };
  /** Distractor signals (same topic, next door or the other wing, same week) that ended up in a planted issue. */
  distractorsLinked: { n: number; total: number };
  issues: { total: number; found: number; byScenario: Record<string, { total: number; found: number }> };
  agreement: { recurred: { n: number; correct: number }; fixHeld: { n: number; correct: number }; rootCause: { n: number; correct: number } };
  predicted: { issues: number; multiSignal: number; largest: number };
};

export async function evaluateLinking(db: Db, propertyId: string, dataDir: string): Promise<LinkReport> {
  const key = JSON.parse(await readFile(path.join(dataDir, "answer_key.json"), "utf8")) as { signals: KeySignal[]; issues: KeyIssue[] };

  const signalRows = await db
    .select({ id: schema.signals.id, source: schema.signals.source, externalId: schema.signals.externalId })
    .from(schema.signals)
    .where(eq(schema.signals.propertyId, propertyId));
  const idByKey = new Map(signalRows.map((r) => [`${r.source}:${r.externalId}`, r.id]));

  const links = await db
    .select({ issueId: schema.issueSignals.issueId, signalId: schema.issueSignals.signalId })
    .from(schema.issueSignals)
    .where(eq(schema.issueSignals.propertyId, propertyId));
  const issueOfSignal = new Map(links.map((l) => [l.signalId, l.issueId]));

  const locations = await db.select({ id: schema.locations.id, code: schema.locations.code }).from(schema.locations).where(eq(schema.locations.propertyId, propertyId));
  const codeOf = new Map(locations.map((l) => [l.id, l.code]));
  const issueRows = await db
    .select({ id: schema.issues.id, status: schema.issues.status, reopenCount: schema.issues.reopenCount, locationId: schema.issues.locationId, rootCause: schema.issues.rootCause })
    .from(schema.issues)
    .where(eq(schema.issues.propertyId, propertyId));
  const issueById = new Map(issueRows.map((i) => [i.id, i]));

  // Our id for each key signal, and its predicted issue (own id when unlinked).
  const ourId = (k: KeySignal) => idByKey.get(`${SOURCE_BY_FILE[k.source_file]}:${k.record_id}`);
  const predicted = (k: KeySignal) => {
    const id = ourId(k);
    return id ? issueOfSignal.get(id) ?? `single:${id}` : null;
  };
  const planted = key.signals.filter((s) => s.role === "planted");
  const distractors = key.signals.filter((s) => s.role === "distractor");

  // Pairwise over planted + distractor signals.
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let distractorFp = 0;
  const scored = [...planted, ...distractors];
  for (let i = 0; i < scored.length; i++) {
    for (let j = i + 1; j < scored.length; j++) {
      const a = scored[i];
      const b = scored[j];
      const truth = a.role === "planted" && b.role === "planted" && a.issue_id === b.issue_id;
      const pa = predicted(a);
      const pb = predicted(b);
      const pred = pa !== null && pa === pb;
      if (truth && pred) tp++;
      else if (!truth && pred) {
        fp++;
        if (a.role === "distractor" || b.role === "distractor") distractorFp++;
      } else if (truth && !pred) fn++;
    }
  }
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;

  const plantedIssues = new Set(planted.map((p) => predicted(p)).filter((p): p is string => Boolean(p) && !p!.startsWith("single:")));
  const distractorsLinked = distractors.filter((d) => {
    const p = predicted(d);
    return p && plantedIssues.has(p);
  }).length;

  // Issue-level: found when a majority of its signals share one predicted issue of size >= 2.
  const byScenario: Record<string, { total: number; found: number }> = {};
  let found = 0;
  const agreement = { recurred: { n: 0, correct: 0 }, fixHeld: { n: 0, correct: 0 }, rootCause: { n: 0, correct: 0 } };
  const plantedByIssue = new Map<string, KeySignal[]>();
  for (const s of planted) {
    const arr = plantedByIssue.get(s.issue_id!) ?? [];
    arr.push(s);
    plantedByIssue.set(s.issue_id!, arr);
  }
  for (const issue of key.issues) {
    const sc = (byScenario[issue.scenario] ??= { total: 0, found: 0 });
    sc.total++;
    const members = plantedByIssue.get(issue.issue_id) ?? [];
    const counts = new Map<string, number>();
    for (const m of members) {
      const p = predicted(m);
      if (p && !p.startsWith("single:")) counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    let best: string | null = null;
    let n = 0;
    for (const [p, c] of counts) if (c > n) {
      best = p;
      n = c;
    }
    if (!best || n < 2 || n < members.length / 2) continue;
    found++;
    sc.found++;
    const ours = issueById.get(best);
    if (!ours) continue;
    const episodes = Number(/(\d+) episodes?/.exec(ours.rootCause ?? "")?.[1] ?? 1);
    const oursRecurred = ours.reopenCount > 0 || episodes >= 2 || ours.status === "reopened";
    agreement.recurred.n++;
    if (oursRecurred === issue.recurred) agreement.recurred.correct++;
    if (issue.fix_held !== null) {
      agreement.fixHeld.n++;
      const oursHeld = ours.status === "resolved" || ours.status === "closed_unverified" || ours.status === "verified";
      if (oursHeld === issue.fix_held) agreement.fixHeld.correct++;
    }
    agreement.rootCause.n++;
    const code = ours.locationId ? codeOf.get(ours.locationId) : null;
    if (code && code.toUpperCase() === issue.root_cause.location.toUpperCase()) agreement.rootCause.correct++;
  }

  const sizes = new Map<string, number>();
  for (const l of links) sizes.set(l.issueId, (sizes.get(l.issueId) ?? 0) + 1);
  const multi = [...sizes.values()].filter((n) => n >= 2).length;
  const largest = Math.max(0, ...sizes.values());

  return {
    pairs: { tp, fp, fn, distractorFp, precision, recall, f1 },
    distractorsLinked: { n: distractorsLinked, total: distractors.length },
    issues: { total: key.issues.length, found, byScenario },
    agreement,
    predicted: { issues: issueRows.length, multiSignal: multi, largest },
  };
}

export function formatLinkReport(r: LinkReport): string {
  const pct = (c: number, n: number) => (n ? `${((100 * c) / n).toFixed(1)}%` : "n/a");
  const lines = [
    `pairs: precision ${(100 * r.pairs.precision).toFixed(1)}%  recall ${(100 * r.pairs.recall).toFixed(1)}%  F1 ${(100 * r.pairs.f1).toFixed(1)}%  (tp ${r.pairs.tp}, fp ${r.pairs.fp} of which distractor ${r.pairs.distractorFp}, fn ${r.pairs.fn})`,
    `distractors pulled into a planted issue: ${r.distractorsLinked.n}/${r.distractorsLinked.total}`,
    `issues found: ${r.issues.found}/${r.issues.total}`,
  ];
  for (const [sc, v] of Object.entries(r.issues.byScenario)) lines.push(`  ${sc.padEnd(22)} ${v.found}/${v.total}`);
  lines.push(
    `agreement on found issues: recurred ${pct(r.agreement.recurred.correct, r.agreement.recurred.n)}, fix held ${pct(r.agreement.fixHeld.correct, r.agreement.fixHeld.n)}, root cause location ${pct(r.agreement.rootCause.correct, r.agreement.rootCause.n)}`,
    `predicted: ${r.predicted.issues} issues, ${r.predicted.multiSignal} with 2+ signals, largest ${r.predicted.largest}`,
  );
  return lines.join("\n");
}
