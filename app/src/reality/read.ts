import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { decodeBytes, detectDelimiter, detectHeaderRow, detectLineEndings, emptyKinds, headerNames, kindOfText, oneSheetPerMonth } from "./detect";
import type { CellKind, FileFormat, FormatDetection, ParsedFile, Row, SheetInfo, UnreadFile } from "./types";

/**
 * Read a client's export folder as delivered. Every CSV / XLSX / JSON file
 * becomes a table of string cells with a format detection attached; other
 * files are listed with the reason they were not read. Nothing is written,
 * nothing leaves the process.
 */

export type ReadResult = { files: ParsedFile[]; unread: UnreadFile[] };

export type ReadOptions = {
  /** Sub-folders to skip (the memo's own output folder, for one). */
  skipDirs?: string[];
  /** Stop reading a file after this many rows (0 = all). */
  maxRows?: number;
};

const DOCUMENT_EXT = new Set([".pdf", ".docx", ".doc", ".pptx", ".ppt", ".odt", ".rtf", ".md", ".txt"]);
const UNSUPPORTED_REASON: Record<string, string> = {
  ".xls": "old Excel format (.xls); please re-save as .xlsx",
  ".xlsb": "binary Excel workbook (.xlsb); please re-save as .xlsx",
  ".ods": "OpenDocument spreadsheet; please re-save as .xlsx or CSV",
  ".zip": "archive; please unpack before delivery",
  ".7z": "archive; please unpack before delivery",
  ".rar": "archive; please unpack before delivery",
  ".xml": "XML; tell us which tool produced it",
  ".numbers": "Apple Numbers; please export as .xlsx or CSV",
};

export async function readExportFolder(dir: string, opts: ReadOptions = {}): Promise<ReadResult> {
  const root = path.resolve(dir);
  const skip = new Set((opts.skipDirs ?? []).map((d) => path.resolve(root, d)));
  const paths = await walk(root, skip);
  const files: ParsedFile[] = [];
  const unread: UnreadFile[] = [];
  for (const abs of paths.sort()) {
    const rel = path.relative(root, abs).split(path.sep).join("/");
    const ext = path.extname(abs).toLowerCase();
    const bytes = (await stat(abs)).size;
    try {
      if (ext === ".csv" || ext === ".tsv" || (ext === ".txt" && (await looksDelimited(abs)))) {
        const parsed = await readCsv(abs, rel, bytes, opts);
        if (parsed) files.push(parsed);
        else unread.push({ path: rel, bytes, format: "csv", reason: "no delimited table found in the file" });
      } else if (ext === ".xlsx" || ext === ".xlsm") {
        files.push(...(await readXlsx(abs, rel, bytes, opts)));
      } else if (ext === ".json" || ext === ".jsonl" || ext === ".ndjson") {
        const parsed = await readJson(abs, rel, bytes, opts);
        if ("reason" in parsed) unread.push({ path: rel, bytes, format: "json", reason: parsed.reason });
        else files.push(parsed);
      } else if (DOCUMENT_EXT.has(ext)) {
        unread.push({ path: rel, bytes, format: "document", reason: "document, listed but not parsed (SOPs, plans, checklists)" });
      } else {
        unread.push({ path: rel, bytes, format: "unsupported", reason: UNSUPPORTED_REASON[ext] ?? `unsupported file type (${ext || "no extension"})` });
      }
    } catch (err) {
      unread.push({ path: rel, bytes, format: formatOf(ext), reason: `could not be read: ${(err as Error).message}` });
    }
  }
  return { files, unread };
}

function formatOf(ext: string): FileFormat {
  if (ext === ".csv" || ext === ".tsv" || ext === ".txt") return "csv";
  if (ext === ".xlsx" || ext === ".xlsm") return "xlsx";
  if (ext === ".json" || ext === ".jsonl" || ext === ".ndjson") return "json";
  return DOCUMENT_EXT.has(ext) ? "document" : "unsupported";
}

async function walk(dir: string, skip: Set<string>): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name.startsWith("~$")) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (skip.has(abs)) continue;
      out.push(...(await walk(abs, skip)));
    } else if (entry.isFile()) {
      out.push(abs);
    }
  }
  return out;
}

async function looksDelimited(abs: string): Promise<boolean> {
  const head = decodeBytes(new Uint8Array(await readFile(abs))).text.slice(0, 4000);
  return detectDelimiter(head) !== null;
}

function baseDetection(format: FileFormat, bytes: number): FormatDetection {
  return { format, bytes, encoding: "n/a", bom: false, lineEndings: null, delimiter: null, headerRow: null, sheets: [], oneSheetPerMonth: false, jsonShape: null, notes: [] };
}

async function readCsv(abs: string, rel: string, bytes: number, opts: ReadOptions): Promise<ParsedFile | null> {
  const decoded = decodeBytes(new Uint8Array(await readFile(abs)));
  const detection = baseDetection("csv", bytes);
  detection.encoding = decoded.encoding;
  detection.bom = decoded.bom;
  detection.lineEndings = detectLineEndings(decoded.text);
  const delimiter = detectDelimiter(decoded.text);
  if (!delimiter) return null;
  detection.delimiter = delimiter;
  const records = parse(decoded.text, {
    delimiter,
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: false,
    trim: false,
    bom: false,
  }) as string[][];
  const headerRow = detectHeaderRow(records);
  detection.headerRow = headerRow;
  if (headerRow > 1) detection.notes.push(`${headerRow - 1} line(s) above the header skipped`);
  const columns = headerNames(records[headerRow - 1] ?? []);
  const rows: Row[] = [];
  const cellKinds = kindsFor(columns);
  let ragged = 0;
  for (let i = headerRow; i < records.length; i++) {
    const rec = records[i];
    if (rec.every((c) => c.trim() === "")) continue;
    if (rec.length !== columns.length) ragged++;
    const row: Row = {};
    columns.forEach((c, j) => {
      const v = (rec[j] ?? "").trim();
      row[c] = v;
      cellKinds[c][kindOfText(v)]++;
    });
    rows.push(row);
    if (opts.maxRows && rows.length >= opts.maxRows) break;
  }
  if (ragged) detection.notes.push(`${ragged} row(s) with a different number of fields than the header`);
  return { path: rel, detection, columns, rows, cellKinds };
}

function kindsFor(columns: string[]): Record<string, Record<CellKind, number>> {
  return Object.fromEntries(columns.map((c) => [c, emptyKinds()]));
}

type SheetTable = { info: SheetInfo; rows: Row[]; cellKinds: Record<string, Record<CellKind, number>> };

async function readXlsx(abs: string, rel: string, bytes: number, opts: ReadOptions): Promise<ParsedFile[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(abs);
  const tables: SheetTable[] = [];
  for (const ws of wb.worksheets) {
    if (ws.state && ws.state !== "visible") continue;
    const t = readSheet(ws, opts);
    if (t) tables.push(t);
  }
  if (!tables.length) {
    return [{ path: rel, detection: { ...baseDetection("xlsx", bytes), notes: ["no sheet with a header row and data"] }, columns: [], rows: [], cellKinds: {} }];
  }
  // Sheets with the same columns are one table (one sheet per month); others are tables of their own.
  const groups = new Map<string, SheetTable[]>();
  for (const t of tables) {
    const key = t.info.columns.map((c) => c.toLowerCase()).join("\u0000");
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const out: ParsedFile[] = [];
  for (const group of groups.values()) {
    const detection = baseDetection("xlsx", bytes);
    detection.encoding = "n/a (XLSX)";
    detection.sheets = group.map((g) => g.info);
    detection.headerRow = group[0].info.headerRow;
    detection.oneSheetPerMonth = oneSheetPerMonth(group.map((g) => g.info.name), true);
    if (group.length > 1 && !detection.oneSheetPerMonth) detection.notes.push(`${group.length} sheets with the same columns were read as one table`);
    const titles = group.map((g) => g.info.title).filter(Boolean);
    if (titles.length) detection.notes.push(`title row(s) above the header, e.g. “${titles[0]}”`);
    const columns = group[0].info.columns;
    const rows = group.flatMap((g) => g.rows);
    const cellKinds = kindsFor(columns);
    for (const g of group) for (const c of columns) for (const k of Object.keys(cellKinds[c]) as CellKind[]) cellKinds[c][k] += g.cellKinds[c]?.[k] ?? 0;
    const suffix = groups.size > 1 ? `#${group.map((g) => g.info.name).join("+")}` : "";
    out.push({ path: `${rel}${suffix}`, detection, columns, rows, cellKinds });
  }
  return out;
}

function readSheet(ws: ExcelJS.Worksheet, opts: ReadOptions): SheetTable | null {
  // Find the header: the first of the top rows with mostly text cells and (nearly) the widest non-empty count.
  const probe: { n: number; cells: (string | null)[]; textShare: number }[] = [];
  const LOOK = 25;
  for (let r = 1; r <= Math.min(LOOK, ws.rowCount); r++) {
    const row = ws.getRow(r);
    const cells: (string | null)[] = [];
    let nonEmpty = 0;
    let text = 0;
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      const v = cellText(cell.value);
      cells[col] = v;
      if (v !== null && v !== "") {
        nonEmpty++;
        if (typeof cell.value === "string" || (typeof cell.value === "object" && cell.value && "richText" in cell.value)) text++;
      }
    });
    probe.push({ n: nonEmpty, cells, textShare: nonEmpty ? text / nonEmpty : 0 });
  }
  const widest = Math.max(0, ...probe.map((p) => p.n));
  if (widest < 2) return null;
  const headerIndex = probe.findIndex((p) => p.n >= Math.max(2, widest * 0.6) && p.textShare >= 0.6 && distinctShare(p.cells) >= 0.9);
  if (headerIndex < 0) return null;
  const headerRow = headerIndex + 1;
  const title = headerRow > 1 ? (probe.slice(0, headerIndex).flatMap((p) => p.cells).find((c) => c && c.trim()) ?? null) : null;
  const headerCells = probe[headerIndex].cells;
  const colIndexes: number[] = [];
  const names: string[] = [];
  headerCells.forEach((c, i) => {
    if (c !== null && c !== undefined) {
      colIndexes.push(i);
      names.push(c);
    }
  });
  const columns = headerNames(names);
  const cellKinds = kindsFor(columns);
  const rows: Row[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRow) return;
    if (opts.maxRows && rows.length >= opts.maxRows) return;
    const out: Row = {};
    let any = false;
    colIndexes.forEach((col, j) => {
      const cell = row.getCell(col);
      const v = cell.value;
      const name = columns[j];
      let text = "";
      let kind: CellKind = "empty";
      if (v instanceof Date) {
        text = isoFromExcelDate(v);
        kind = "date";
      } else if (v === null || v === undefined) {
        text = "";
      } else if (typeof v === "number") {
        text = String(v);
        kind = "number";
      } else if (typeof v === "boolean") {
        text = v ? "TRUE" : "FALSE";
        kind = "bool";
      } else if (typeof v === "object" && "result" in v) {
        const r = v.result;
        if (r instanceof Date) {
          text = isoFromExcelDate(r);
          kind = "date";
        } else {
          text = r === undefined || r === null ? "" : String(r);
          kind = text ? kindOfText(text) : "empty";
        }
      } else if (typeof v === "object" && "richText" in v) {
        text = v.richText.map((t) => t.text).join("");
        kind = text.trim() ? "text" : "empty";
      } else if (typeof v === "object" && "text" in v) {
        text = String(v.text ?? "");
        kind = text.trim() ? "text" : "empty";
      } else {
        text = String(v);
        kind = text.trim() ? "text" : "empty";
      }
      text = text.trim();
      if (text) any = true;
      out[name] = text;
      cellKinds[name][kind === "empty" && text ? "text" : kind]++;
    });
    if (any) rows.push(out);
  });
  return { info: { name: ws.name, headerRow, rows: rows.length, columns, title }, rows, cellKinds };
}

function distinctShare(cells: (string | null)[]): number {
  const filled = cells.filter((c): c is string => !!c && c.trim() !== "").map((c) => c.trim().toLowerCase());
  if (!filled.length) return 0;
  return new Set(filled).size / filled.length;
}

function cellText(v: ExcelJS.CellValue): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return isoFromExcelDate(v);
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("result" in v) return v.result === undefined || v.result === null ? "" : String(v.result);
    if ("text" in v) return String(v.text ?? "");
    return String(v);
  }
  return String(v);
}

/** Excel dates come back as UTC instants; print the wall-clock parts as the sheet showed them. */
function isoFromExcelDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
  const hasTime = d.getUTCHours() || d.getUTCMinutes();
  return hasTime ? `${date} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` : date;
}

type JsonRecord = Record<string, unknown>;

async function readJson(abs: string, rel: string, bytes: number, opts: ReadOptions): Promise<ParsedFile | { reason: string }> {
  const decoded = decodeBytes(new Uint8Array(await readFile(abs)));
  const detection = baseDetection("json", bytes);
  detection.encoding = decoded.encoding;
  detection.bom = decoded.bom;
  const ext = path.extname(abs).toLowerCase();
  let records: JsonRecord[];
  let where: string;
  if (ext === ".jsonl" || ext === ".ndjson") {
    records = decoded.text.split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l) as JsonRecord);
    where = "one record per line";
  } else {
    const doc = JSON.parse(decoded.text) as unknown;
    const found = tableOf(doc);
    if ("reason" in found) return { reason: found.reason };
    records = found.records;
    where = found.path ? `records under “${found.path}”` : "a top-level array of records";
  }
  if (!records.length) return { reason: "no records in the document" };
  if (opts.maxRows) records = records.slice(0, opts.maxRows);
  const columns: string[] = [];
  const seen = new Set<string>();
  const rows: Row[] = records.map((rec) => {
    const flat = flatten(rec);
    for (const k of Object.keys(flat)) {
      if (!seen.has(k)) {
        seen.add(k);
        columns.push(k);
      }
    }
    return flat;
  });
  const cellKinds = kindsFor(columns);
  for (const r of rows) for (const c of columns) cellKinds[c][kindOfText(r[c] ?? "")]++;
  const shapes = new Set(records.map((r) => Object.keys(r).sort().join(",")));
  const discriminator = ["platform", "source", "type", "channel", "site"].find((k) => records.every((r) => typeof r[k] === "string"));
  const shapeNote = discriminator
    ? `${shapes.size} record shape(s) by “${discriminator}”: ${[...new Set(records.map((r) => String(r[discriminator])))].join(", ")}`
    : `${shapes.size} record shape(s)`;
  detection.jsonShape = `${where}, ${records.length} records, ${shapeNote}`;
  for (const r of rows) for (const c of columns) if (!(c in r)) r[c] = "";
  return { path: rel, detection, columns, rows, cellKinds };
}

type RecordList = { records: JsonRecord[]; path: string };

function recordList(value: unknown, path: string): RecordList | null {
  if (!Array.isArray(value) || !value.length) return null;
  const objects = value.filter((x) => x && typeof x === "object" && !Array.isArray(x)) as JsonRecord[];
  return objects.length >= value.length * 0.9 ? { records: objects, path } : null;
}

/**
 * A JSON export is a table when it is one list of records: a top-level array,
 * or an object that wraps exactly one such list (with metadata beside it, at
 * most one level down). A document with several lists, or none, is a report
 * or a nested object, not a table, and is listed with that reason.
 */
function tableOf(doc: unknown): RecordList | { reason: string } {
  const top = recordList(doc, "");
  if (top) return top;
  if (Array.isArray(doc)) return { reason: `array of ${doc.length} values that are not records, not a table` };
  if (!doc || typeof doc !== "object") return { reason: "a single JSON value, not a table" };
  const lists: RecordList[] = [];
  for (const [k, v] of Object.entries(doc as JsonRecord)) {
    const direct = recordList(v, k);
    if (direct) {
      lists.push(direct);
      continue;
    }
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v as JsonRecord)) {
        const nested = recordList(v2, `${k}.${k2}`);
        if (nested) lists.push(nested);
      }
    }
  }
  const keys = Object.keys(doc as JsonRecord);
  if (lists.length === 1) return lists[0];
  if (!lists.length) return { reason: `nested object with ${keys.length} keys (${keys.slice(0, 6).join(", ")}${keys.length > 6 ? ", …" : ""}) and no list of records, not a table` };
  return { reason: `nested document with ${lists.length} lists of records (${lists.map((l) => l.path).slice(0, 6).join(", ")}${lists.length > 6 ? ", …" : ""}), a report rather than a table` };
}

function flatten(rec: JsonRecord, prefix = ""): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(rec)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v === null || v === undefined) out[key] = "";
    else if (Array.isArray(v)) out[key] = v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(" | ");
    else if (typeof v === "object") Object.assign(out, flatten(v as JsonRecord, key));
    else out[key] = String(v).trim();
  }
  return out;
}
