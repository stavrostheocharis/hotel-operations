import { DATASETS, type Content, type DatasetSpec, type FieldSpec } from "./catalogue";
import { classifyDate } from "./dates";
import type { DatasetKey, FieldMatch, ParsedFile } from "./types";

/**
 * Header matching. A client's columns are matched against the data request's
 * fields by name: exact after normalisation, then a known spelling contained
 * in the header, then character-bigram similarity. Every match carries a
 * confidence and the method, so the memo can say how sure it is; a column
 * that matches nothing is reported, not guessed.
 */

/** Lower-case, accents stripped, punctuation to spaces, `#` / `№` read as "no". */
export function normalizeHeader(header: string): string {
  return header
    .replace(/[#№]/g, " no ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stem(token: string): string {
  return token.length > 4 ? token.replace(/(es|s)$/u, "") : token;
}

function bigrams(s: string): Map<string, number> {
  const out = new Map<string, number>();
  const t = ` ${s} `;
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
}

/** Sørensen–Dice coefficient over character bigrams, 0..1. */
export function dice(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ga = bigrams(a);
  const gb = bigrams(b);
  let shared = 0;
  let total = 0;
  for (const [g, n] of ga) {
    total += n;
    shared += Math.min(n, gb.get(g) ?? 0);
  }
  for (const n of gb.values()) total += n;
  return total ? (2 * shared) / total : 0;
}

type NameScore = { confidence: number; method: FieldMatch["method"] };

/** How well a header fits a field, by name alone. */
export function scoreHeader(header: string, field: FieldSpec): NameScore | null {
  const h = normalizeHeader(header);
  if (!h) return null;
  const hTokens = h.split(" ").map(stem);
  let best: NameScore | null = null;
  const consider = (c: NameScore) => {
    if (!best || c.confidence > best.confidence) best = c;
  };
  for (const raw of field.synonyms) {
    const s = normalizeHeader(raw);
    if (!s) continue;
    if (s === h) {
      consider({ confidence: 1, method: s === normalizeHeader(field.label) ? "exact" : "synonym" });
      continue;
    }
    const sTokens = s.split(" ").map(stem);
    if (sTokens.length === hTokens.length && sTokens.every((t, i) => t === hTokens[i])) {
      consider({ confidence: 0.95, method: "synonym" });
      continue;
    }
    // A multi-word spelling contained in the header: "closure note (free text)".
    if (sTokens.length >= 2 && containsSequence(hTokens, sTokens)) {
      consider({ confidence: 0.85, method: "fuzzy" });
      continue;
    }
    // A single word of at least four letters as one of the header's words: "guest comment" → comment.
    if (sTokens.length === 1 && sTokens[0].length >= 4 && hTokens.includes(sTokens[0])) {
      consider({ confidence: hTokens.length <= 2 ? 0.7 : 0.6, method: "fuzzy" });
      continue;
    }
    // Short tokens ("id", "no") only as a whole word of a two-word header: "ticket id".
    if (sTokens.length === 1 && sTokens[0].length < 4 && hTokens.length === 2 && hTokens.includes(sTokens[0])) {
      consider({ confidence: 0.6, method: "fuzzy" });
      continue;
    }
    const d = dice(h, s);
    if (d >= 0.8) consider({ confidence: Math.round(d * 0.9 * 100) / 100, method: "fuzzy" });
    // A typo: one edit (or a swapped pair) in a word of five letters or more.
    else if (s.length >= 5 && editDistance(h, s) <= (s.length >= 10 ? 2 : 1)) consider({ confidence: 0.75, method: "fuzzy" });
  }
  return best;
}

/** Damerau–Levenshtein distance (adjacent swaps count once), capped for short strings. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 3;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

function containsSequence(haystack: string[], needle: string[]): boolean {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

/** Share of non-empty sampled values that look like the field's content type (1 when there is nothing to check). */
export function contentFit(values: string[], content: Content | undefined): number {
  if (!content || content === "text") return 1;
  const sample = values.filter((v) => v !== "").slice(0, 300);
  if (!sample.length) return 1;
  const ok = sample.filter((v) => fits(v, content)).length;
  return ok / sample.length;
}

function fits(v: string, content: Content): boolean {
  switch (content) {
    case "date":
      return classifyDate(v) !== null;
    case "time":
      return /^\d{1,2}:\d{2}(:\d{2})?$/.test(v.trim()) || /^\d{1,2}[.:]\d{2}\s*(am|pm)$/i.test(v.trim());
    case "number":
      return /^-?\d+([.,]\d+)?\s*%?$/.test(v.trim());
    case "id":
      return v.trim().length <= 40 && !/\s{2,}/.test(v) && v.trim().split(/\s+/).length <= 3;
    case "room":
      // Two digits or a letter prefix: a column of 1–10 values is a score, not a room.
      return /^[\p{L}]{0,6}[\s.\-#]*\d{2,4}[a-z]?$/iu.test(v.trim()) || /^[\p{L}]{1,6}[\s.\-#]*\d{1,4}[a-z]?$/iu.test(v.trim());
    case "flag":
      return /^(y|n|yes|no|true|false|0|1|ναι|όχι|x|✓)$/iu.test(v.trim());
    default:
      return true;
  }
}

export type Mapping = {
  dataset: DatasetSpec;
  score: number;
  fields: FieldMatch[];
  unmapped: string[];
};

type Candidate = { field: FieldSpec; column: string; confidence: number; method: FieldMatch["method"]; fit: number };

/** Map a file's columns onto one dataset's fields. Greedy by confidence; a column feeds one field. */
export function mapColumns(file: ParsedFile, dataset: DatasetSpec): Mapping {
  const values = (col: string) => file.rows.map((r) => r[col] ?? "");
  const fitCache = new Map<string, number>();
  const fitOf = (col: string, content: Content | undefined) => {
    const k = `${col}\u0000${content ?? ""}`;
    let f = fitCache.get(k);
    if (f === undefined) {
      f = contentFit(values(col), content);
      fitCache.set(k, f);
    }
    return f;
  };

  const candidates: Candidate[] = [];
  for (const column of file.columns) {
    for (const field of dataset.fields) {
      const name = scoreHeader(column, field);
      if (!name) continue;
      const fit = fitOf(column, field.content);
      // Values that do not look right halve the confidence: "room" as a 1–10 score is not a room number.
      const confidence = Math.round(name.confidence * (fit >= 0.5 ? 1 : 0.5) * 100) / 100;
      if (confidence < 0.6) continue;
      candidates.push({ field, column, confidence, method: name.method, fit });
    }
  }
  candidates.sort((a, b) => b.confidence - a.confidence || a.field.synonyms.length - b.field.synonyms.length || a.column.localeCompare(b.column));

  const usedColumns = new Set<string>();
  const byField = new Map<string, Candidate[]>();
  for (const c of candidates) {
    if (usedColumns.has(c.column)) continue;
    const taken = byField.get(c.field.key);
    if (taken && !c.field.multi) continue;
    if (taken && c.field.multi && c.confidence < 0.6) continue;
    usedColumns.add(c.column);
    byField.set(c.field.key, [...(taken ?? []), c]);
  }

  const fields: FieldMatch[] = dataset.fields.map((spec) => {
    const picked = byField.get(spec.key);
    if (!picked) {
      return { field: spec.key, label: spec.label, required: spec.required, columns: [], confidence: 0, method: "missing", filled: null, note: null };
    }
    const columns = picked.map((p) => p.column);
    const filled = file.rows.filter((r) => columns.some((c) => (r[c] ?? "").trim() !== "")).length;
    const confidence = Math.max(...picked.map((p) => p.confidence));
    const method = picked.reduce<FieldMatch["method"]>((m, p) => (rank(p.method) > rank(m) ? p.method : m), picked[0].method);
    const notes: string[] = [];
    const weakFit = picked.filter((p) => p.fit < 0.5);
    if (weakFit.length) notes.push(`values in ${weakFit.map((p) => `“${p.column}”`).join(", ")} do not look like ${spec.content}s`);
    if (spec.content === "id" && !spec.multi && file.rows.length) {
      const distinct = new Set(file.rows.map((r) => (r[columns[0]] ?? "").trim()).filter(Boolean)).size;
      if (distinct < filled) notes.push(`${filled - distinct} repeated ids`);
    }
    return { field: spec.key, label: spec.label, required: spec.required, columns, confidence, method, filled, note: notes.length ? notes.join("; ") : null };
  });

  const unmapped = file.columns.filter((c) => !usedColumns.has(c));
  let score = 0;
  for (const f of fields) {
    if (f.method === "missing") continue;
    score += (f.required ? 2 : 1) * f.confidence;
    if (f.columns.length > 1) score += 0.5 * (f.columns.length - 1);
  }
  return { dataset, score, fields, unmapped };
}

function rank(m: FieldMatch["method"]): number {
  return m === "exact" ? 3 : m === "synonym" ? 2 : m === "fuzzy" ? 1 : 0;
}

export type LookedLike = {
  dataset: DatasetKey;
  /** Labels of the data-request fields that matched. */
  matched: string[];
  /** Why the file was not taken for the dataset. */
  why: string;
};

export type Classification = {
  dataset: DatasetKey;
  mapping: Mapping | null;
  alternatives: { dataset: DatasetKey; score: number }[];
  /** Set when the file resembled a dataset without qualifying for it. */
  lookedLike: LookedLike | null;
};

export type Eligibility = { eligible: boolean; strong: number; needStrong: number; keys: number; core: boolean; floor: number; why: string[] };

const CONFIDENT = 0.85;

/**
 * The rule. A file is taken for a dataset when, confidently matched (≥ 85%):
 *   - at least `minKeys` of the dataset's identifying columns (job id,
 *     created at … for tickets) are present — a file name never waives this;
 *   - one of the dataset's core fields is present;
 *   - at least 40% of the minimum fields, and never fewer than three, are
 *     present (one fewer when the file name names the dataset);
 *   - the mapping score reaches a floor set by the number of minimum fields
 *     (0.6 per field, 0.5 with a name clue).
 */
export function eligibility(dataset: DatasetSpec, mapping: Mapping, hint: boolean): Eligibility {
  const required = dataset.fields.filter((f) => f.required).length;
  const confident = (f: FieldMatch) => f.method !== "missing" && f.confidence >= CONFIDENT;
  const strong = mapping.fields.filter((f) => f.required && confident(f)).length;
  const base = Math.min(required, Math.max(3, Math.ceil(0.4 * required)));
  const needStrong = hint ? Math.max(2, base - 1) : base;
  const keys = mapping.fields.filter((f) => dataset.keyFields.includes(f.field) && confident(f)).length;
  const core = mapping.fields.some((f) => dataset.coreFields.includes(f.field) && confident(f));
  const floor = hint ? Math.max(3, 0.5 * required) : Math.max(4, 0.6 * required);
  const why: string[] = [];
  const labelOf = (key: string) => dataset.fields.find((f) => f.key === key)?.label ?? key;
  if (keys < dataset.minKeys) why.push(`only ${keys} of the identifying columns (${dataset.keyFields.map(labelOf).join(", ")}) found, ${dataset.minKeys} needed`);
  if (!core) why.push(`none of its core columns (${dataset.coreFields.map(labelOf).join(", ")}) found`);
  if (strong >= needStrong && mapping.score < floor) why.push("too few columns matched overall");
  if (strong < needStrong) why.push(`${strong} of the ${needStrong} minimum fields needed`);
  return { eligible: keys >= dataset.minKeys && core && strong >= needStrong && mapping.score >= floor, strong, needStrong, keys, core, floor, why };
}

/**
 * Which dataset of the data request a file is. The file name is a clue, the
 * columns are the evidence; see `eligibility` for the rule. A file that
 * resembles a dataset without qualifying is reported as such, with the
 * columns that matched and the reason, so a stray report never swells the
 * counts silently.
 */
export function classifyFile(file: ParsedFile): Classification {
  const name = file.path.toLowerCase();
  const scored = DATASETS.map((dataset) => {
    const mapping = mapColumns(file, dataset);
    const hint = dataset.nameHints.test(name);
    const e = eligibility(dataset, mapping, hint);
    return { dataset, mapping, score: mapping.score + (hint ? 4 : 0), e };
  });
  scored.sort((a, b) => b.score - a.score);
  const alternatives = scored.slice(0, 3).map((s) => ({ dataset: s.dataset.key, score: Math.round(s.score * 10) / 10 }));
  const best = scored.find((s) => s.e.eligible);
  if (best) return { dataset: best.dataset.key, mapping: best.mapping, alternatives, lookedLike: null };
  const resemblance = scored.find((s) => s.e.strong >= 2);
  const lookedLike: LookedLike | null = resemblance
    ? {
        dataset: resemblance.dataset.key,
        matched: resemblance.mapping.fields.filter((f) => f.method !== "missing").map((f) => f.label),
        why: resemblance.e.why.join("; "),
      }
    : null;
  return { dataset: "unknown", mapping: null, alternatives, lookedLike };
}
