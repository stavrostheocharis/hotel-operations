import type { Colour, Decision, FileReport, RealityReport } from "./types";

/**
 * The memo, as Markdown. It follows docs/discovery/05-go-no-go.md: export
 * summary, one section per file, the scorecard, the decision, the reshaping
 * asks and the data gaps log. Every figure comes from the report object; the
 * renderer adds no number of its own.
 */
export function renderMemo(r: RealityReport): string {
  const out: string[] = [];
  const h = (level: number, text: string) => out.push(`${"#".repeat(level)} ${text}`, "");
  const p = (text: string) => out.push(text, "");
  const list = (items: string[]) => out.push(...items.map((i) => `- ${i}`), "");

  const received = r.datasets.filter((d) => d.status === "received");
  const missing = r.datasets.filter((d) => d.status === "missing");
  const folderName = r.folder.split(/[\\/]/).filter(Boolean).at(-1) ?? r.folder;

  h(1, `Data reality check · ${folderName}`);
  p(`Generated ${r.generatedAt.slice(0, 10)} · ${r.version} · ${int(r.files.length)} table(s) read from ${int(r.files.length + r.unread.length)} file(s), ${int(received.length)} of the ${int(r.datasets.length)} datasets of the data request recognised. Nothing was loaded into a database; the folder was read in memory and measured.`);

  h(2, `Verdict: ${VERDICT[r.decision.verdict]}`);
  if (r.decision.stopConditions.length) {
    p("Stop conditions that hold:");
    list(r.decision.stopConditions);
  }
  list(r.decision.reasons);
  p(VERDICT_MEANING[r.decision.verdict]);

  h(2, "Export summary");
  table(
    out,
    ["Dataset", "Priority", "File(s)", "Rows", "Date range", "Status"],
    r.datasets.map((d) => [d.label, PRIORITY[d.priority], d.files.length ? d.files.map(code).join(", ") : "–", d.rows ? int(d.rows) : "–", d.dateRange ? `${d.dateRange.from} → ${d.dateRange.to}` : "–", d.status === "received" ? "received" : "**missing**"]),
  );
  const season = r.summary.season;
  list([
    `Season covered: ${season ? `${season.from} → ${season.to} (from ${season.basis})` : "unknown: no occupancy, stay or ticket dates could be read"}.`,
    `Occupied room-nights in season: ${r.summary.occupiedRoomNights === null ? "unknown (no occupancy report)" : int(r.summary.occupiedRoomNights)}.`,
    `Row counts: ${["work_orders", "complaints", "surveys", "reviews", "stays"].map((k) => `${LABEL_SHORT[k]} ${r.summary.rowCounts[k as keyof typeof r.summary.rowCounts] === undefined ? "–" : int(r.summary.rowCounts[k as keyof typeof r.summary.rowCounts]!)}`).join(" · ")}.`,
    missing.length ? `Not received: ${missing.map((d) => d.label.replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase())).join(", ")}.` : "Every dataset of the data request was received.",
  ]);
  if (r.unread.length) {
    p("Files listed but not parsed:");
    table(out, ["File", "Size", "Why"], r.unread.map((u) => [code(u.path), size(u.bytes), u.reason]));
  }

  h(2, "Scorecard");
  p("Green / Amber / Red from the thresholds of the go/no-go scorecard (first-version defaults, to be recalibrated after the first property). A dimension takes the worst colour of its measures; “–” means the measure could not be taken from this export.");
  table(
    out,
    ["Dimension", "Colour", "Measure", "Measured", "Green · Amber · Red"],
    r.scorecard.flatMap((d) =>
      d.rows.length
        ? d.rows.map((row, i) => [i === 0 ? `**${d.dimension}** ${d.title}` : "", i === 0 ? colour(d.colour) : "", row.measure, row.value, row.thresholds])
        : [[`**${d.dimension}** ${d.title}`, colour(d.colour), "–", "–", "–"]],
    ),
  );
  p("D4 is scored on survey linkability only at this stage; topic overlap and corroboration need the normalisation step and are measured in the audit itself. D7 (commercial reality) is filled by the account lead, not by this check.");

  h(2, "Coverage measures");
  p("The records-assessment view of the same export: each measure with its value, its colour and what it means.");
  table(
    out,
    ["Measure", "Value", "Verdict", "Note"],
    r.measures.map((m) => [m.label, m.value, m.verdict === "info" ? "info" : colour(m.verdict), m.note]),
  );
  if (r.statusVocabulary.length) {
    p(`Status vocabulary in the work-order export (${int(r.statusVocabulary.length)} distinct spellings, read as ${distinctMeanings(r)}):`);
    table(out, ["Value", "Tickets", "Read as"], r.statusVocabulary.map((s) => [code(s.value), int(s.count), s.meaning.replace("_", " ")]));
  }
  if (r.unresolvedLocations.length) {
    p("Location spellings in work orders that did not resolve (most frequent first; the start of the alias table):");
    table(out, ["As typed", "Tickets"], r.unresolvedLocations.map((u) => [code(u.text), int(u.count)]));
  }

  h(2, "Reshaping asks for the client");
  if (r.asks.length) out.push(...r.asks.map((a, i) => `${i + 1}. ${a.dimension ? `**${a.dimension}** · ` : ""}${a.text}`), "");
  else p("None. The export can be used as delivered.");

  h(2, "Data gaps log");
  if (r.gaps.length) table(out, ["#", "Gap", "Dataset", "Impact on deliverable", "Hotel can fix?"], r.gaps.map((g, i) => [String(i + 1), g.gap, g.dataset, g.impact, g.fix]));
  else p("No gaps against the data request.");

  h(2, "Files");
  for (const f of r.files) renderFile(out, f);

  h(2, "Method");
  list([
    "**Format.** Encoding from the byte-order mark or by decoding (UTF-8, else Windows-1253 Greek, else Latin-1); delimiter as the character with the most consistent count across the first lines; header as the first row of distinct text cells; XLSX sheets with the same columns read as one table, named by month when the sheet names are months; JSON read at the largest array of records.",
    "**Fields.** Columns matched to the data request by name: exact after normalisation, a known spelling contained in the header, then character similarity; values that do not fit the field (a “room” column holding scores) weaken the match. Columns matched to nothing are listed, not guessed.",
    "**Location resolves** when the typed text matches the room / asset list exactly or by a known spelling, or through a documented rule (room number in the text, building letter, villa number, plant keyword). No analyst guesses are counted.",
    "**Usable closure note** states an action and an object; empty, “done”, “OK”, “fixed”, “έγινε”, “closed” or a copy of the request do not count. A note **names a part or a cause** when it contains a replacement verb or a part word (valve, pump, filter, battery, μπαταρία…), by keyword, so that figure is a floor.",
    "**Recurrence candidate**: a closed ticket followed by a same-category ticket at the same resolved place within 30 days. **Duplicate**: a same-category ticket at the same place within two hours of an earlier one.",
    "**Season**: the occupancy report's range, else first arrival to last departure, else the ticket range. Weeks are ISO weeks.",
    "**Personal data**: identity columns are counted by their header and never read; free text is scanned for e-mail, phone, IBAN and card patterns and only the count is reported. No value from the export appears in this memo except location spellings, status values and column names.",
  ]);

  return out.join("\n");
}

function renderFile(out: string[], f: FileReport): void {
  const d = f.detection;
  out.push(`### ${code(f.path)} → ${f.datasetLabel}${f.priority ? ` (${PRIORITY[f.priority]})` : ""}`, "");
  const format: string[] = [];
  if (d.format === "csv") format.push(`CSV, ${delimiterName(d.delimiter)}, ${d.encoding}${d.lineEndings ? `, ${d.lineEndings} line endings` : ""}, header on line ${d.headerRow ?? 1}`);
  if (d.format === "xlsx") format.push(`XLSX, ${d.sheets.length} sheet(s)${d.oneSheetPerMonth ? " — one sheet per month" : ""} (${d.sheets.map((s) => `${s.name}: ${int(s.rows)}`).join(", ")}), header on row ${d.headerRow ?? 1}${d.sheets[0]?.title ? `, title row above it` : ""}`);
  if (d.format === "json") format.push(`JSON, ${d.encoding}${d.jsonShape ? `; ${d.jsonShape}` : ""}`);
  const items = [`**Format:** ${format.join("; ") || d.format}. ${int(f.rows)} rows, ${size(d.bytes)}.${f.dateRange ? ` Date range ${f.dateRange.from} → ${f.dateRange.to} (from ${code(f.dateRange.column)}).` : ""}`];
  if (f.dateFormats.length) items.push(`**Dates:** ${f.dateFormats.map((x) => `${code(x.column)} ${x.format} (${int(x.filled)} of ${int(x.total)} filled)`).join("; ")}.`);
  if (f.languages.length) items.push(`**Language of free text:** ${f.languages.map((l) => `${code(l.column)}: ${l.mix.map((m) => `${m.language} ${pct(m.share)}`).join(", ")}`).join("; ")}.`);
  if (f.identityColumns.length) items.push(`**Identity columns (header only, deleted on arrival):** ${f.identityColumns.map(code).join(", ")}.`);
  if (f.warnings.length) items.push(`**Notes:** ${f.warnings.join("; ")}.`);
  out.push(...items.map((i) => `- ${i}`), "");
  if (f.fields.length) {
    const found = f.fields.filter((x) => x.method !== "missing");
    const missingRequired = f.fields.filter((x) => x.method === "missing" && x.required);
    const missingOptional = f.fields.filter((x) => x.method === "missing" && !x.required);
    table(
      out,
      ["Field (data request)", "Column", "Match", "Filled"],
      found.map((x) => [`${x.label}${x.required ? "" : " ·"}`, x.columns.map(code).join(" + "), `${x.method} ${Math.round(x.confidence * 100)}%`, x.filled === null ? "–" : `${pct(f.rows ? x.filled / f.rows : null)}`]),
    );
    if (missingRequired.length) out.push(`Minimum fields not found: ${missingRequired.map((x) => `**${x.label}**`).join(", ")}.`, "");
    if (missingOptional.length) out.push(`Helpful fields not present: ${missingOptional.map((x) => x.label).join(", ")}.`, "");
    if (f.unmappedColumns.length) out.push(`Columns not placed: ${f.unmappedColumns.map(code).join(", ")}.`, "");
  } else if (f.dataset === "unknown") {
    out.push(`Columns: ${f.unmappedColumns.map(code).join(", ")}.`, "");
  }
}

const VERDICT: Record<Decision, string> = { go: "GO", reshape: "RESHAPE", stop: "STOP" };
const VERDICT_MEANING: Record<Decision, string> = {
  go: "The export supports the audit as offered. The asks below are tidy-ups for the full delivery, not conditions.",
  reshape: "No stop condition holds, but the audit has to change shape or the export has to be fixed before it proceeds. The asks below say what; pick the smallest change that makes the audit honest.",
  stop: "The data does not support the audit as offered. We still deliver the records assessment and a list of what to capture in 2027; a different property of the group may have better records.",
};
const PRIORITY = { must: "must have", should: "should have", nice: "nice to have" } as const;
const LABEL_SHORT: Record<string, string> = { work_orders: "WO", complaints: "complaints", surveys: "surveys", reviews: "reviews", stays: "stays" };

function colour(c: Colour): string {
  return c === "green" ? "Green" : c === "amber" ? "Amber" : c === "red" ? "Red" : "–";
}

function distinctMeanings(r: RealityReport): string {
  const m = new Map<string, number>();
  for (const s of r.statusVocabulary) m.set(s.meaning, (m.get(s.meaning) ?? 0) + s.count);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k.replace("_", " ")} ${int(n)}`).join(", ");
}

function delimiterName(d: string | null): string {
  return d === ";" ? "semicolon-separated" : d === "," ? "comma-separated" : d === "\t" ? "tab-separated" : d === "|" ? "pipe-separated" : "delimiter unknown";
}

function table(out: string[], header: string[], rows: string[][]): void {
  if (!rows.length) return;
  out.push(`| ${header.join(" | ")} |`, `| ${header.map(() => "---").join(" | ")} |`);
  for (const r of rows) out.push(`| ${r.map(cell).join(" | ")} |`);
  out.push("");
}

function cell(v: string): string {
  return v.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function code(v: string): string {
  return v.includes("`") ? `“${v}”` : `\`${v}\``;
}

function int(n: number): string {
  return new Intl.NumberFormat("en-GB").format(Math.round(n));
}

function pct(share: number | null): string {
  return share === null ? "–" : `${Math.round(share * 1000) / 10}%`;
}

function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
