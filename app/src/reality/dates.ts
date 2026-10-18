/**
 * Date formats as exports write them, recognised without a library. Values
 * are read as the property's wall-clock time: the check only needs ranges,
 * weeks and differences, never an instant.
 */

export type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** True when the source only gave a month ("July 2026"). */
  monthOnly: boolean;
};

export type DateHit = {
  /** The format family, as the memo prints it. */
  format: string;
  parts: DateParts;
  /** For slash / dot / dash dates: whether the value was read day-first; null when the value does not say. */
  dayFirstEvidence: "day-first" | "month-first" | null;
};

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
  ιαν: 1, ιανουαριος: 1, ιανουάριος: 1, φεβ: 2, φεβρουαριος: 2, φεβρουάριος: 2, μαρ: 3, μαρτιος: 3, μάρτιος: 3, απρ: 4, απριλιος: 4, απρίλιος: 4,
  μαι: 5, μαιος: 5, μάιος: 5, ιουν: 6, ιουνιος: 6, ιούνιος: 6, ιουλ: 7, ιουλιος: 7, ιούλιος: 7, αυγ: 8, αυγουστος: 8, αύγουστος: 8,
  σεπ: 9, σεπτεμβριος: 9, σεπτέμβριος: 9, οκτ: 10, οκτωβριος: 10, οκτώβριος: 10, νοε: 11, νοεμβριος: 11, νοέμβριος: 11, δεκ: 12, δεκεμβριος: 12, δεκέμβριος: 12,
  januar: 1, februar: 2, märz: 3, maerz: 3, mai: 5, juni: 6, juli: 7, oktober: 10, dezember: 12,
  janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, juin: 6, juillet: 7, août: 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12, decembre: 12,
  gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6, luglio: 7, agosto: 8, settembre: 9, ottobre: 10, dicembre: 12,
};

export function monthFromName(name: string): number | null {
  const key = name.toLowerCase().replace(/\.$/, "");
  return MONTHS[key] ?? null;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATETIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/;
const ISO_ZONED = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;
const SLASH = /^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const SLASH_YEAR_FIRST = /^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?$/;
const DOT = /^(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})(?:[ T,]*(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const DASH = /^(\d{1,2})-(\d{1,2})-(\d{4}|\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/;
const MONTH_YEAR = /^(\p{L}+)\.?\s+(\d{4})$/u;
const YEAR_MONTH = /^(\d{4})-(\d{2})$/;
const MONTH_SLASH_YEAR = /^(\d{1,2})\/(\d{4})$/;
const DAY_MONTH_YEAR = /^(\d{1,2})\.?\s+(\p{L}+)\.?,?\s+(\d{4})(?:[ ,]+(\d{1,2}):(\d{2}))?$/u;
const MONTH_DAY_YEAR = /^(\p{L}+)\.?\s+(\d{1,2}),?\s+(\d{4})(?:[ ,]+(\d{1,2}):(\d{2}))?$/u;
const EXCEL_SERIAL = /^\d{5}(\.\d+)?$/;

function valid(year: number, month: number, day: number): boolean {
  return year >= 1990 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

function make(year: number, month: number, day: number, hour = 0, minute = 0, monthOnly = false): DateParts | null {
  if (!valid(year, month, day)) return null;
  if (hour > 23 || minute > 59) return null;
  return { year, month, day, hour, minute, monthOnly };
}

/**
 * Classify one cell. Slash, dot and dash dates are read day-first (the Greek
 * convention) unless `monthFirst` is set by the column-level decision.
 */
export function classifyDate(value: string, monthFirst = false): DateHit | null {
  const v = value.trim();
  if (!v) return null;
  let m: RegExpExecArray | null;

  if ((m = ISO_ZONED.exec(v))) {
    const p = make(+m[1], +m[2], +m[3], +m[4], +m[5]);
    return p && { format: "ISO 8601 datetime with zone", parts: p, dayFirstEvidence: null };
  }
  if ((m = ISO_DATETIME.exec(v))) {
    const p = make(+m[1], +m[2], +m[3], +m[4], +m[5]);
    return p && { format: "YYYY-MM-DD HH:MM", parts: p, dayFirstEvidence: null };
  }
  if ((m = ISO_DATE.exec(v))) {
    const p = make(+m[1], +m[2], +m[3]);
    return p && { format: "YYYY-MM-DD", parts: p, dayFirstEvidence: null };
  }
  if ((m = SLASH_YEAR_FIRST.exec(v))) {
    const p = make(+m[1], +m[2], +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
    return p && { format: m[4] ? "YYYY/MM/DD HH:MM" : "YYYY/MM/DD", parts: p, dayFirstEvidence: null };
  }
  for (const [re, sep] of [[SLASH, "/"], [DOT, "."], [DASH, "-"]] as const) {
    if ((m = re.exec(v))) {
      const a = +m[1];
      const b = +m[2];
      const evidence = a > 12 ? "day-first" : b > 12 ? "month-first" : null;
      const dayFirst = evidence ? evidence === "day-first" : !monthFirst;
      // "15/07/26": a two-digit year is this century
      const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
      const p = make(year, dayFirst ? b : a, dayFirst ? a : b, m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
      const time = m[4] ? " HH:MM" : "";
      const yy = m[3].length === 2 ? "YY" : "YYYY";
      const format = dayFirst ? `DD${sep}MM${sep}${yy}${time}` : `MM${sep}DD${sep}${yy}${time}`;
      return p && { format, parts: p, dayFirstEvidence: evidence };
    }
  }
  if ((m = MONTH_YEAR.exec(v))) {
    const month = monthFromName(m[1]);
    const p = month && make(+m[2], month, 1, 0, 0, true);
    return p ? { format: "Month YYYY (month only)", parts: p, dayFirstEvidence: null } : null;
  }
  if ((m = YEAR_MONTH.exec(v))) {
    const p = make(+m[1], +m[2], 1, 0, 0, true);
    return p && { format: "YYYY-MM (month only)", parts: p, dayFirstEvidence: null };
  }
  if ((m = MONTH_SLASH_YEAR.exec(v))) {
    const p = make(+m[2], +m[1], 1, 0, 0, true);
    return p && { format: "MM/YYYY (month only)", parts: p, dayFirstEvidence: null };
  }
  if ((m = DAY_MONTH_YEAR.exec(v))) {
    const month = monthFromName(m[2]);
    const p = month && make(+m[3], month, +m[1], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
    return p ? { format: "D Month YYYY", parts: p, dayFirstEvidence: null } : null;
  }
  if ((m = MONTH_DAY_YEAR.exec(v))) {
    const month = monthFromName(m[1]);
    const p = month && make(+m[3], month, +m[2], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
    return p ? { format: "Month D, YYYY", parts: p, dayFirstEvidence: null } : null;
  }
  if (EXCEL_SERIAL.test(v)) {
    const serial = Number(v);
    if (serial >= 30000 && serial <= 70000) {
      const ms = Math.round((serial - 25569) * 86400000);
      const d = new Date(ms);
      const p = make(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes());
      return p && { format: "Excel serial number", parts: p, dayFirstEvidence: null };
    }
  }
  return null;
}

export type ColumnDates = {
  /** Dominant format(s) with their share of the dated values, e.g. "DD/MM/YYYY HH:MM". */
  format: string;
  /** Non-empty values that parsed as a date. */
  dated: number;
  nonEmpty: number;
  /** Parsed values, in row order, null where the cell was empty or not a date. */
  parsed: (DateParts | null)[];
  monthFirst: boolean;
  ambiguous: boolean;
  sample: string;
};

/**
 * Read a whole column. The day/month order of slash dates is decided once
 * for the column from the values that settle it (a day above 12); when
 * nothing settles it the Greek order is assumed and the memo says so.
 */
export function readDateColumn(values: string[], excelDateCells = 0): ColumnDates {
  let dayFirst = 0;
  let monthFirst = 0;
  for (const v of values) {
    const hit = classifyDate(v);
    if (hit?.dayFirstEvidence === "day-first") dayFirst++;
    else if (hit?.dayFirstEvidence === "month-first") monthFirst++;
  }
  const readMonthFirst = monthFirst > dayFirst;
  const formats = new Map<string, number>();
  const parsed: (DateParts | null)[] = [];
  let nonEmpty = 0;
  let dated = 0;
  let sample = "";
  let numericOnly = 0;
  for (const v of values) {
    const t = v.trim();
    if (!t) {
      parsed.push(null);
      continue;
    }
    nonEmpty++;
    const hit = classifyDate(t, readMonthFirst);
    if (hit) {
      dated++;
      if (!sample) sample = t;
      formats.set(hit.format, (formats.get(hit.format) ?? 0) + 1);
      parsed.push(hit.parts);
    } else {
      if (/^-?\d+([.,]\d+)?$/.test(t)) numericOnly++;
      parsed.push(null);
    }
  }
  const ranked = [...formats.entries()].sort((a, b) => b[1] - a[1]);
  let format: string;
  if (excelDateCells > 0 && excelDateCells >= dated) format = "Excel date cells";
  else if (!ranked.length) format = numericOnly === nonEmpty && nonEmpty > 0 ? "numbers, not dates" : "no dates recognised";
  else if (ranked.length === 1 || ranked[0][1] / dated >= 0.97) format = ranked[0][0];
  else format = ranked.slice(0, 3).map(([f, n]) => `${f} (${Math.round((n / dated) * 100)}%)`).join(", ");
  const slashLike = ranked.some(([f]) => /^(DD|MM)[/.\-]/.test(f));
  const ambiguous = slashLike && dayFirst === 0 && monthFirst === 0;
  const mixed = dayFirst > 0 && monthFirst > 0;
  if (ambiguous) format += ", day/month order assumed (no day above 12 seen)";
  if (mixed) format += `, day/month order inconsistent (${dayFirst} day-first, ${monthFirst} month-first)`;
  return { format, dated, nonEmpty, parsed, monthFirst: readMonthFirst, ambiguous, sample };
}

/** Minutes since 1970 on a naive calendar: enough for ranges, weeks and differences. */
export function toMinutes(p: DateParts): number {
  return Math.round(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) / 60000);
}

export function toIsoDate(p: DateParts): string {
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Combine a date cell with a separate "HH:MM" time cell. */
export function withTime(p: DateParts, time: string): DateParts {
  const m = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!m) return p;
  return { ...p, hour: Math.min(23, +m[1]), minute: Math.min(59, +m[2]) };
}

/** ISO week key "YYYY-Www" for coverage counting. */
export function isoWeek(p: DateParts): string {
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Month names in several languages, for "one sheet per month" detection. */
export function looksLikeMonthName(name: string): boolean {
  const t = name.trim().toLowerCase();
  if (monthFromName(t)) return true;
  if (/^(\d{1,2}[./-]\d{4}|\d{4}[./-]\d{1,2})$/.test(t)) return true;
  const m = /^(\p{L}+)\.?\s*[-']?\s*(\d{2}|\d{4})$/u.exec(t);
  return !!m && monthFromName(m[1]) !== null;
}
