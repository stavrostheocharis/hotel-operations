import type { DatasetKey, FieldMatch, ParsedFile, RealityReport } from "@/reality/types";

/**
 * The "custom connection" for a client: which file is which dataset, and
 * which columns feed which field of the data request. The reality check
 * works it out; a person can correct it; the loader applies it. Stored on
 * the import batch as JSON.
 */
/** Catalogue fields that identify a person; their columns never reach `raw`. */
export const IDENTITY_FIELDS = ["stay_key", "assigned_to"] as const;

export type FileMapping = {
  /** Path as the reality check reports it (with `#Sheet` for a split workbook). */
  path: string;
  dataset: DatasetKey;
  /** field key → the column(s) that feed it. Several columns are joined with " / ". */
  fields: Record<string, string[]>;
  /** Dates are day-first unless the reality check saw otherwise. */
  monthFirst: boolean;
  /** Columns the reality check flagged as a person's identity: dropped from `raw`, never mapped. */
  drop?: string[];
};

export type ImportMapping = {
  version: "import-mapping-v1";
  files: FileMapping[];
};

const LOADABLE: DatasetKey[] = ["work_orders", "complaints", "compensation", "surveys", "reviews", "stays", "occupancy", "rooms", "facilities", "equipment"];

export function mappingFromReport(report: RealityReport): ImportMapping {
  const files: FileMapping[] = [];
  for (const f of report.files) {
    if (!LOADABLE.includes(f.dataset) || f.lowConfidence) continue;
    const fields: Record<string, string[]> = {};
    for (const m of f.fields) if (m.method !== "missing" && m.columns.length) fields[m.field] = m.columns;
    const monthFirst = f.dateFormats.some((d) => /^M/.test(d.format) && !/^MMM/.test(d.format));
    files.push({ path: f.path, dataset: f.dataset, fields, monthFirst, ...(f.identityColumns.length ? { drop: [...f.identityColumns] } : {}) });
  }
  return { version: "import-mapping-v1", files };
}

/** What a dataset needs before it can be loaded at all; `a|b` means either. */
export const REQUIRED_FOR_LOAD: Partial<Record<DatasetKey, string[]>> = {
  work_orders: ["id", "created_at", "description"],
  complaints: ["occurred_at", "description"],
  compensation: ["date"],
  surveys: ["submitted_at|departure_date"],
  reviews: ["review_date", "text"],
  stays: ["stay_key", "arrival"],
  occupancy: ["date", "rooms_occupied"],
  rooms: ["room_code"],
  facilities: ["name"],
  equipment: ["name"],
};

export function missingForLoad(m: FileMapping): string[] {
  return (REQUIRED_FOR_LOAD[m.dataset] ?? []).filter((k) => !k.split("|").some((alt) => m.fields[alt]?.length)).map((k) => k.replace("|", " or "));
}

export type Rec = Record<string, string>;

/** Rows of a parsed file as records keyed by the data request's field names; unmapped columns stay under `_raw`. */
export function project(file: ParsedFile, mapping: FileMapping): { rec: Rec; raw: Rec }[] {
  const entries = Object.entries(mapping.fields);
  // Identity never reaches `raw`: the columns the check flagged, and the columns behind identity fields.
  const hidden = new Set<string>([...(mapping.drop ?? []), ...IDENTITY_FIELDS.flatMap((f) => mapping.fields[f] ?? [])]);
  return file.rows.map((row) => {
    const rec: Rec = {};
    for (const [field, columns] of entries) {
      const values = columns.map((c) => (row[c] ?? "").trim()).filter(Boolean);
      if (values.length) rec[field] = values.join(" / ");
    }
    const raw: Rec = {};
    for (const [k, v] of Object.entries(row)) if (!hidden.has(k)) raw[k] = v;
    return { rec, raw };
  });
}

/** The mapping a person corrected, checked against the file's real columns. */
export function validateMapping(mapping: ImportMapping, files: ParsedFile[]): string[] {
  const problems: string[] = [];
  const byPath = new Map(files.map((f) => [f.path, f]));
  for (const m of mapping.files) {
    const f = byPath.get(m.path);
    if (!f) {
      problems.push(`${m.path}: file not in the folder`);
      continue;
    }
    for (const [field, cols] of Object.entries(m.fields)) for (const c of cols) if (!f.columns.includes(c)) problems.push(`${m.path}: column "${c}" (for ${field}) not in the file`);
    for (const k of missingForLoad(m)) problems.push(`${m.path}: no column for ${k}`);
  }
  return problems;
}

export { type FieldMatch };
