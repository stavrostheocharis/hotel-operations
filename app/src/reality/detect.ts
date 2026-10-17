import { looksLikeMonthName } from "./dates";
import type { CellKind, FormatDetection } from "./types";

/**
 * Format detection for a raw export: encoding and byte-order mark, line
 * endings, delimiter and header row. Pure functions over bytes and text, so
 * the tests can feed them fragments.
 */

export type Decoded = { text: string; encoding: string; bom: boolean };

export function decodeBytes(bytes: Uint8Array): Decoded {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder("utf-8").decode(bytes.subarray(3)), encoding: "UTF-8 with BOM", bom: true };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder("utf-16le").decode(bytes.subarray(2)), encoding: "UTF-16 LE with BOM", bom: true };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: new TextDecoder("utf-16be").decode(bytes.subarray(2)), encoding: "UTF-16 BE with BOM", bom: true };
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const ascii = bytes.every((b) => b < 0x80);
    return { text, encoding: ascii ? "UTF-8 (ASCII only)" : "UTF-8", bom: false };
  } catch {
    // Not UTF-8: a Greek-locale export from an older tool. Prefer Windows-1253 when it yields Greek letters.
    const greek = new TextDecoder("windows-1253").decode(bytes);
    const greekLetters = (greek.match(/[Ͱ-Ͽ]/g) ?? []).length;
    const highBytes = bytes.filter((b) => b >= 0x80).length;
    if (highBytes && greekLetters / highBytes > 0.6) {
      return { text: greek, encoding: "Windows-1253 (Greek, not UTF-8)", bom: false };
    }
    return { text: new TextDecoder("windows-1252").decode(bytes), encoding: "Windows-1252 / Latin-1 (not UTF-8)", bom: false };
  }
}

export function detectLineEndings(text: string): FormatDetection["lineEndings"] {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/(?<!\r)\n/g) ?? []).length;
  const cr = (text.match(/\r(?!\n)/g) ?? []).length;
  const kinds = [crlf, lf, cr].filter((n) => n > 0).length;
  if (kinds === 0) return null;
  if (kinds > 1) return "mixed";
  return crlf ? "CRLF" : lf ? "LF" : "CR";
}

const DELIMITERS = [";", ",", "\t", "|"] as const;

/** Count delimiter characters outside double quotes. */
function countOutsideQuotes(line: string, delimiter: string): number {
  let inQuotes = false;
  let n = 0;
  for (const ch of line) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch === delimiter) n++;
  }
  return n;
}

/**
 * The delimiter is the candidate that appears on the most lines with a
 * consistent count. A title line with no delimiter does not disqualify it.
 */
export function detectDelimiter(text: string): string | null {
  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim() !== "").slice(0, 40);
  if (!lines.length) return null;
  let best: { delimiter: string; score: number } | null = null;
  for (const d of DELIMITERS) {
    const counts = lines.map((l) => countOutsideQuotes(l, d)).filter((n) => n > 0);
    if (counts.length < Math.max(2, lines.length * 0.5)) continue;
    const mode = modeOf(counts);
    const consistent = counts.filter((n) => n === mode).length / counts.length;
    const score = consistent * 10 + Math.min(mode, 30) / 10 + counts.length / lines.length;
    if (!best || score > best.score) best = { delimiter: d, score };
  }
  return best?.delimiter ?? null;
}

function modeOf(values: number[]): number {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}

/**
 * Find the header among the first records: the first one with (nearly) the
 * modal number of fields whose cells are mostly distinct, non-numeric text.
 * Title rows and blank rows above it are skipped.
 */
export function detectHeaderRow(records: string[][]): number {
  const widths = records.map((r) => r.filter((c) => c.trim() !== "").length);
  const mode = modeOf(widths.filter((w) => w >= 2).length ? widths.filter((w) => w >= 2) : widths);
  for (let i = 0; i < Math.min(records.length, 25); i++) {
    const cells = records[i].map((c) => c.trim()).filter(Boolean);
    if (cells.length < Math.max(2, mode * 0.6)) continue;
    const textCells = cells.filter((c) => !/^-?\d+([.,]\d+)?$/.test(c) && !/^\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}/.test(c)).length;
    const distinct = new Set(cells.map((c) => c.toLowerCase())).size;
    if (textCells / cells.length >= 0.7 && distinct >= cells.length * 0.9) return i + 1;
  }
  return 1;
}

/** Column names from a header record: blanks and repeats get stable names. */
export function headerNames(cells: string[]): string[] {
  const seen = new Map<string, number>();
  return cells.map((raw, i) => {
    const base = raw.trim() || `column_${i + 1}`;
    const n = seen.get(base.toLowerCase()) ?? 0;
    seen.set(base.toLowerCase(), n + 1);
    return n ? `${base} (${n + 1})` : base;
  });
}

export function oneSheetPerMonth(sheetNames: string[], sameLayout: boolean): boolean {
  if (sheetNames.length < 2 || !sameLayout) return false;
  const monthish = sheetNames.filter(looksLikeMonthName).length;
  return monthish >= Math.max(2, Math.ceil(sheetNames.length * 0.7));
}

/** Kind of a value for the per-column type profile when the source is text (CSV / JSON). */
export function kindOfText(value: string): CellKind {
  const v = value.trim();
  if (!v) return "empty";
  if (/^-?\d+([.,]\d+)?$/.test(v)) return "number";
  if (/^(true|false|yes|no|y|n)$/i.test(v)) return "bool";
  return "text";
}

export function emptyKinds(): Record<CellKind, number> {
  return { empty: 0, text: 0, number: 0, date: 0, bool: 0 };
}
