/**
 * The phase-0 data reality check, as data. One report per export folder; the
 * Markdown memo and the JSON file are both rendered from this shape. It
 * answers docs/discovery/05-go-no-go.md without loading anything into the
 * database: the folder is read, parsed in memory and measured.
 *
 * Nothing in here names a person. Identity columns are counted, never
 * copied; free text is scanned for personal data and only the counts leave.
 */
export const REALITY_VERSION = "reality-check-v1";

export type FileFormat = "csv" | "xlsx" | "json" | "document" | "unsupported";

export type DatasetKey =
  | "work_orders"
  | "complaints"
  | "compensation"
  | "surveys"
  | "reviews"
  | "stays"
  | "occupancy"
  | "rooms"
  | "facilities"
  | "equipment"
  | "sops"
  | "unknown";

export type Priority = "must" | "should" | "nice";

/** Green / Amber / Red from the scorecard; "na" when the measure cannot be taken from this export. */
export type Colour = "green" | "amber" | "red" | "na";

export type Decision = "go" | "reshape" | "stop";

export type Dimension = "D1" | "D2" | "D3" | "D4" | "D5" | "D6";

export type CellKind = "empty" | "text" | "number" | "date" | "bool";

export type Row = Record<string, string>;

export type SheetInfo = {
  name: string;
  headerRow: number;
  rows: number;
  columns: string[];
  title: string | null;
};

export type FormatDetection = {
  format: FileFormat;
  bytes: number;
  /** "UTF-8", "UTF-8 with BOM", "UTF-16 LE", "Windows-1253 (Greek)", "Windows-1252 / Latin-1", "n/a". */
  encoding: string;
  bom: boolean;
  lineEndings: "CRLF" | "LF" | "CR" | "mixed" | null;
  delimiter: string | null;
  /** 1-based row of the header in the file (CSV) or in the first sheet (XLSX). */
  headerRow: number | null;
  sheets: SheetInfo[];
  oneSheetPerMonth: boolean;
  jsonShape: string | null;
  notes: string[];
};

/** One table read from the folder. An XLSX with sheets of different layouts yields one per layout. */
export type ParsedFile = {
  /** Path relative to the folder, with `#Sheet` when a workbook was split. */
  path: string;
  detection: FormatDetection;
  columns: string[];
  rows: Row[];
  /** Per column: how many cells were typed as text / number / date / bool / empty. */
  cellKinds: Record<string, Record<CellKind, number>>;
};

export type UnreadFile = { path: string; bytes: number; format: FileFormat; reason: string };

export type FieldMatch = {
  field: string;
  label: string;
  required: boolean;
  columns: string[];
  confidence: number;
  method: "exact" | "synonym" | "fuzzy" | "missing";
  /** Rows with a non-empty value in (any of) the mapped column(s). */
  filled: number | null;
  note: string | null;
};

export type DateFormatInfo = {
  column: string;
  field: string | null;
  format: string;
  filled: number;
  total: number;
  sample: string;
};

export type LanguageShare = { language: string; count: number; share: number };

export type Measure = {
  key: string;
  label: string;
  count: number;
  total: number | null;
  share: number | null;
  /** The value as the memo prints it. */
  value: string;
  verdict: Colour | "info";
  dimension: Dimension | null;
  note: string;
};

export type FileReport = {
  path: string;
  dataset: DatasetKey;
  datasetLabel: string;
  priority: Priority | null;
  datasetScore: number;
  rows: number;
  detection: FormatDetection;
  dateRange: { from: string; to: string; column: string } | null;
  dateFormats: DateFormatInfo[];
  languages: { column: string; mix: LanguageShare[] }[];
  fields: FieldMatch[];
  unmappedColumns: string[];
  /** Columns whose header says they carry a guest's or an employee's identity. Names of columns, never values. */
  identityColumns: string[];
  warnings: string[];
};

export type DatasetSummary = {
  dataset: DatasetKey;
  label: string;
  priority: Priority;
  files: string[];
  rows: number;
  dateRange: { from: string; to: string } | null;
  status: "received" | "missing";
};

export type ScoreRow = {
  dimension: Dimension;
  measure: string;
  value: string;
  colour: Colour;
  thresholds: string;
};

export type DimensionResult = {
  dimension: Dimension;
  title: string;
  colour: Colour;
  rows: ScoreRow[];
};

export type Ask = {
  dimension: Dimension | null;
  dataset: DatasetKey | null;
  text: string;
};

export type Gap = {
  gap: string;
  dataset: string;
  impact: string;
  fix: string;
};

export type RealityReport = {
  version: typeof REALITY_VERSION;
  generatedAt: string;
  folder: string;
  files: FileReport[];
  unread: UnreadFile[];
  datasets: DatasetSummary[];
  summary: {
    season: { from: string; to: string; basis: string } | null;
    occupiedRoomNights: number | null;
    rowCounts: Partial<Record<DatasetKey, number>>;
  };
  /** Dataset-level coverage measures (the records-assessment style table). */
  measures: Measure[];
  /** The most frequent location spellings that did not resolve, for the alias table. */
  unresolvedLocations: { text: string; count: number }[];
  statusVocabulary: { value: string; count: number; meaning: string }[];
  scorecard: DimensionResult[];
  decision: { verdict: Decision; reasons: string[]; stopConditions: string[] };
  asks: Ask[];
  gaps: Gap[];
};
