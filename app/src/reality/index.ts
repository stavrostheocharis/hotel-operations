import { analyze, type Facts } from "./analyze";
import { renderMemo } from "./markdown";
import { readExportFolder, type ReadOptions } from "./read";
import { score } from "./scorecard";
import { REALITY_VERSION, type ParsedFile, type RealityReport, type UnreadFile } from "./types";

export { analyze } from "./analyze";
export type { Facts } from "./analyze";
export { classifyFile, mapColumns, normalizeHeader, scoreHeader } from "./headers";
export { classifyDate, readDateColumn } from "./dates";
export { decodeBytes, detectDelimiter, detectHeaderRow, detectLineEndings } from "./detect";
export { renderMemo } from "./markdown";
export { readExportFolder } from "./read";
export { score } from "./scorecard";
export * from "./types";

/** Facts → the report object the memo and the JSON file are rendered from. Pure. */
export function buildReport(input: { files: ParsedFile[]; unread: UnreadFile[] }, folder: string, now = new Date()): { report: RealityReport; facts: Facts } {
  const facts = analyze(input);
  const scored = score(facts);
  const rowCounts: RealityReport["summary"]["rowCounts"] = {};
  for (const d of facts.datasets) if (d.status === "received" && d.rows) rowCounts[d.dataset] = d.rows;
  const report: RealityReport = {
    version: REALITY_VERSION,
    generatedAt: now.toISOString(),
    folder,
    files: facts.files,
    unread: facts.unread,
    datasets: facts.datasets,
    summary: { season: facts.season, occupiedRoomNights: facts.oc ? facts.oc.roomNights : null, rowCounts },
    measures: scored.measures,
    unresolvedLocations: facts.wo?.unresolvedTop.map((u) => ({ text: u.value, count: u.count })) ?? [],
    statusVocabulary: facts.wo?.statusValues.map((s) => ({ value: s.value, count: s.count, meaning: s.meaning })) ?? [],
    scorecard: scored.scorecard,
    decision: scored.decision,
    asks: scored.asks,
    gaps: scored.gaps,
  };
  return { report, facts };
}

/** Read a folder and build the report and the memo. The only function with I/O besides the readers. */
export async function runRealityCheck(dir: string, opts: ReadOptions & { now?: Date } = {}): Promise<{ report: RealityReport; memo: string; facts: Facts }> {
  const input = await readExportFolder(dir, opts);
  const { report, facts } = buildReport(input, dir, opts.now);
  return { report, memo: renderMemo(report), facts };
}
