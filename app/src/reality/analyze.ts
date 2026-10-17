import { detectLanguage } from "@/normalize/language";
import { scrubPii } from "@/normalize/pii";
import { CATCH_ALL_CATEGORY, DATASET_BY_KEY, DATASET_LABELS, DATASETS, IDENTITY_EXEMPT_DATASETS, IDENTITY_HEADER, isUsableClosureNote, namesPartOrCause, statusMeaning, type DatasetSpec, type StatusMeaning } from "./catalogue";
import { isoWeek, readDateColumn, toIsoDate, toMinutes, withTime, type ColumnDates, type DateParts } from "./dates";
import { classifyFile, type Mapping } from "./headers";
import { buildMaster, resolveTyped, roomExists, roomToken, type Master, type Rec } from "./locations";
import type { DatasetKey, DatasetSummary, DateFormatInfo, FieldMatch, FileReport, LanguageShare, ParsedFile, UnreadFile } from "./types";

/**
 * The pure analysis: parsed files in, facts out. No I/O, no database, no
 * model. Every number the memo prints is computed here; the scorecard turns
 * the facts into colours and the renderer into prose.
 */

export type Counted = { value: string; count: number };

export type WorkOrderFacts = {
  total: number;
  hasLocationField: boolean;
  hasNoteField: boolean;
  hasStatusField: boolean;
  closedByStatus: number;
  withClosedAt: number;
  /** Status says closed, no closure time. */
  closedWithoutTime: number;
  locationFilled: number;
  locatedAsTyped: number;
  locatedWithRules: number;
  locatedEquipment: number;
  roomLike: number;
  roomLikeInList: number;
  /** Closed tickets whose closure-note column exists. */
  closedWithNoteField: number;
  usableNotes: number;
  partNotes: number;
  statusValues: (Counted & { meaning: StatusMeaning })[];
  statusUnknown: number;
  categories: Counted[];
  largestCategoryShare: number | null;
  catchAllShare: number | null;
  /** Tickets with a resolved location, a category and a creation time: the base for duplicates and recurrence. */
  comparable: number;
  duplicates2h: number;
  closedComparable: number;
  recurrence30: number;
  weeksWithTickets: number;
  weeksInSeason: number;
  maxGapDays: number | null;
  gapInPeak: boolean;
  assigneesFilled: number;
  assigneesLookLikeNames: number;
  reopenedFilled: number;
  unresolvedTop: Counted[];
  range: { from: string; to: string } | null;
};

export type ComplaintFacts = {
  total: number;
  roomFilled: number;
  located: number;
  withNote: number;
  withStayKey: number;
  withTime: number;
  departments: Counted[];
  range: { from: string; to: string } | null;
};

export type SurveyFacts = {
  total: number;
  withStayKey: number;
  withRoomAndDeparture: number;
  linkable: number;
  keysChecked: number | null;
  keysInStays: number | null;
  withComment: number;
  range: { from: string; to: string } | null;
};

export type ReviewFacts = {
  total: number;
  withStayDates: number;
  withText: number;
  platforms: Counted[];
  range: { from: string; to: string } | null;
};

export type StayFacts = {
  total: number;
  nights: number;
  distinctKeys: number;
  roomsDistinct: number;
  roomsInList: number | null;
  range: { from: string; to: string } | null;
};

export type OccupancyFacts = {
  total: number;
  days: number;
  spanDays: number;
  roomNights: number;
  range: { from: string; to: string } | null;
};

export type Facts = {
  files: FileReport[];
  unread: UnreadFile[];
  datasets: DatasetSummary[];
  present: Set<DatasetKey>;
  /** Fields of the data request that no file supplied, per received dataset. */
  missingFields: { dataset: DatasetKey; file: string; fields: FieldMatch[] }[];
  season: { from: string; to: string; basis: string } | null;
  wo: WorkOrderFacts | null;
  fd: ComplaintFacts | null;
  sv: SurveyFacts | null;
  rv: ReviewFacts | null;
  st: StayFacts | null;
  oc: OccupancyFacts | null;
  master: Master;
  pii: { identityColumns: { file: string; column: string }[]; textRows: number; textRowsWithPii: number };
};

type Projected = { file: ParsedFile; report: FileReport; mapping: Mapping | null; records: Rec[] };

const LANGUAGE_LABEL: Record<string, string> = { en: "English", el: "Greek", "el-latn": "Greeklish", de: "German", fr: "French", it: "Italian", ru: "Russian", he: "Hebrew" };

export function analyze(input: { files: ParsedFile[]; unread: UnreadFile[] }): Facts {
  const projected = input.files.map(projectFile);
  const byDataset = new Map<DatasetKey, Projected[]>();
  for (const p of projected) byDataset.set(p.report.dataset, [...(byDataset.get(p.report.dataset) ?? []), p]);

  const records = (key: DatasetKey): Rec[] => (byDataset.get(key) ?? []).flatMap((p) => p.records);
  const has = (key: DatasetKey, field: string) => (byDataset.get(key) ?? []).some((p) => p.mapping?.fields.some((f) => f.field === field && f.method !== "missing"));

  const master = buildMaster(records("rooms"), records("facilities"), records("equipment"));

  const oc = byDataset.has("occupancy") ? occupancyFacts(records("occupancy")) : null;
  const st = byDataset.has("stays") ? stayFacts(records("stays"), master) : null;
  const woRecords = records("work_orders");
  const woRange = rangeOf(woRecords, ["created_at"]);
  const season = oc?.range
    ? { ...oc.range, basis: "occupancy by day" }
    : st?.range
      ? { ...st.range, basis: "first arrival to last departure in the stay list" }
      : woRange
        ? { ...woRange, basis: "first to last work order (no occupancy or stay list received)" }
        : null;

  const wo = byDataset.has("work_orders") ? workOrderFacts(woRecords, master, season, { hasNoteField: has("work_orders", "closure_note"), hasLocationField: has("work_orders", "location"), hasStatusField: has("work_orders", "status") }) : null;
  const fd = byDataset.has("complaints") ? complaintFacts(records("complaints"), master) : null;
  const sv = byDataset.has("surveys") ? surveyFacts(records("surveys"), st ? records("stays") : null) : null;
  const rv = byDataset.has("reviews") ? reviewFacts(records("reviews")) : null;

  const present = new Set<DatasetKey>(byDataset.keys());
  present.delete("unknown");
  if (input.unread.some((u) => u.format === "document")) present.add("sops");

  const datasets: DatasetSummary[] = DATASETS.map((d) => {
    const ps = byDataset.get(d.key) ?? [];
    const rows = ps.reduce((n, p) => n + p.file.rows.length, 0);
    const ranges = ps.map((p) => p.report.dateRange).filter((r): r is NonNullable<typeof r> => !!r);
    return {
      dataset: d.key,
      label: d.label,
      priority: d.priority,
      files: ps.map((p) => p.file.path),
      rows,
      dateRange: ranges.length ? { from: ranges.map((r) => r.from).sort()[0], to: ranges.map((r) => r.to).sort().at(-1)! } : null,
      status: ps.length ? "received" : "missing",
    };
  });
  datasets.push({
    dataset: "sops",
    label: DATASET_LABELS.sops,
    priority: "should",
    files: input.unread.filter((u) => u.format === "document").map((u) => u.path),
    rows: 0,
    dateRange: null,
    status: present.has("sops") ? "received" : "missing",
  });

  const missingFields = projected
    .filter((p) => p.mapping)
    .map((p) => ({ dataset: p.report.dataset, file: p.file.path, fields: p.report.fields.filter((f) => f.required && f.method === "missing") }))
    .filter((m) => m.fields.length);

  const pii = scanPii(projected);

  return { files: projected.map((p) => p.report), unread: input.unread, datasets, present, missingFields, season, wo, fd, sv, rv, st, oc, master, pii };
}

/** Classify one file and read it into records keyed by field. */
function projectFile(file: ParsedFile): Projected {
  const cls = classifyFile(file);
  const spec: DatasetSpec | null = cls.dataset === "unknown" ? null : DATASET_BY_KEY[cls.dataset];
  const mapping = cls.mapping;
  const records: Rec[] = [];
  if (spec && mapping) {
    const active = mapping.fields.filter((f) => f.method !== "missing");
    const textual = new Set(spec.fields.filter((f) => f.content === "text" || !f.content).map((f) => f.key));
    for (const row of file.rows) {
      const rec: Rec = {};
      for (const f of active) {
        const values = f.columns.map((c) => (row[c] ?? "").trim()).filter(Boolean);
        rec[f.field] = textual.has(f.field) ? values.join("\n") : (values[0] ?? "");
      }
      records.push(rec);
    }
  }

  const fieldOf = new Map<string, string>();
  if (mapping) for (const f of mapping.fields) for (const c of f.columns) fieldOf.set(c, f.field);

  const dateFormats: DateFormatInfo[] = [];
  const columnDates = new Map<string, ColumnDates>();
  for (const c of file.columns) {
    const values = file.rows.map((r) => r[c] ?? "");
    const field = fieldOf.get(c) ?? null;
    const isDateField = !!field && !!spec?.fields.find((f) => f.key === field && f.content === "date");
    const excelDates = file.cellKinds[c]?.date ?? 0;
    const nonEmpty = values.filter((v) => v.trim()).length;
    if (!nonEmpty) continue;
    const timeLike = values.filter((v) => /^\d{1,2}:\d{2}(:\d{2})?$/.test(v.trim())).length;
    if (timeLike / nonEmpty >= 0.8) {
      dateFormats.push({ column: c, field, format: "HH:MM text", filled: timeLike, total: nonEmpty, sample: values.find((v) => v.trim()) ?? "" });
      continue;
    }
    const cd = readDateColumn(values, excelDates);
    if (isDateField || excelDates > 0 || (cd.dated >= 5 && cd.dated / nonEmpty >= 0.6)) {
      columnDates.set(c, cd);
      dateFormats.push({ column: c, field, format: cd.format, filled: cd.dated, total: cd.nonEmpty, sample: cd.sample });
    }
  }

  let dateRange: FileReport["dateRange"] = null;
  if (spec && mapping) {
    for (const key of spec.dateFields) {
      const col = mapping.fields.find((f) => f.field === key && f.method !== "missing")?.columns[0];
      const cd = col ? columnDates.get(col) : undefined;
      if (!cd) continue;
      let lo: DateParts | null = null;
      let hi: DateParts | null = null;
      for (const p of cd.parsed) {
        if (!p) continue;
        if (!lo || toMinutes(p) < toMinutes(lo)) lo = p;
        if (!hi || toMinutes(p) > toMinutes(hi)) hi = p;
      }
      if (!lo || !hi) continue;
      dateRange = { from: toIsoDate(lo), to: toIsoDate(hi), column: col! };
      break;
    }
  }

  const languages: FileReport["languages"] = [];
  if (spec && mapping) {
    for (const key of spec.textFields) {
      const f = mapping.fields.find((x) => x.field === key && x.method !== "missing");
      if (!f) continue;
      const mix = languageMix(records.map((r) => r[key] ?? ""));
      if (mix.length) languages.push({ column: f.columns.join(" + "), mix });
    }
  }

  const identityColumns = IDENTITY_EXEMPT_DATASETS.includes(cls.dataset)
    ? []
    : file.columns.filter((c) => IDENTITY_HEADER.test(c.toLowerCase().replace(/[_\-.]+/g, " ")));

  const warnings: string[] = [...file.detection.notes];
  if (/not UTF-8/.test(file.detection.encoding)) warnings.push(`encoded as ${file.detection.encoding}; the data request asks for UTF-8`);
  for (const d of dateFormats) if (/assumed|inconsistent/.test(d.format)) warnings.push(`“${d.column}”: ${d.format}`);
  if (mapping) for (const f of mapping.fields) if (f.note) warnings.push(`${f.label}: ${f.note}`);

  const report: FileReport = {
    path: file.path,
    dataset: cls.dataset,
    datasetLabel: DATASET_LABELS[cls.dataset],
    priority: spec?.priority ?? null,
    datasetScore: cls.alternatives[0]?.score ?? 0,
    rows: file.rows.length,
    detection: file.detection,
    dateRange,
    dateFormats,
    languages,
    fields: mapping?.fields ?? [],
    unmappedColumns: mapping ? mapping.unmapped : file.columns,
    identityColumns,
    warnings,
  };
  return { file, report, mapping, records };
}

function languageMix(values: string[]): LanguageShare[] {
  const texts = values.filter((v) => v.trim().length >= 3);
  if (!texts.length) return [];
  const step = Math.max(1, Math.floor(texts.length / 600));
  const counts = new Map<string, number>();
  let n = 0;
  for (let i = 0; i < texts.length; i += step) {
    const g = detectLanguage(texts[i]);
    if (!g.language) continue;
    counts.set(g.language, (counts.get(g.language) ?? 0) + 1);
    n++;
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([code, count]) => ({ language: LANGUAGE_LABEL[code] ?? code, count, share: n ? count / n : 0 }));
}

function parseDates(recs: Rec[], field: string): (DateParts | null)[] {
  return readDateColumn(recs.map((r) => r[field] ?? "")).parsed;
}

function rangeOf(recs: Rec[], fields: string[]): { from: string; to: string } | null {
  let lo: DateParts | null = null;
  let hi: DateParts | null = null;
  for (const f of fields) {
    for (const p of parseDates(recs, f)) {
      if (!p) continue;
      if (!lo || toMinutes(p) < toMinutes(lo)) lo = p;
      if (!hi || toMinutes(p) > toMinutes(hi)) hi = p;
    }
  }
  return lo && hi ? { from: toIsoDate(lo), to: toIsoDate(hi) } : null;
}

function count(values: string[]): Counted[] {
  const m = new Map<string, number>();
  for (const v of values) {
    const t = v.trim();
    if (!t) continue;
    m.set(t, (m.get(t) ?? 0) + 1);
  }
  return [...m.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

const PERSON_NAME = /^\p{Lu}[\p{Ll}'’-]+(?:\s+\p{Lu}[\p{Ll}'’-]+)+$/u;

function workOrderFacts(
  recs: Rec[],
  master: Master,
  season: { from: string; to: string } | null,
  fields: { hasNoteField: boolean; hasLocationField: boolean; hasStatusField: boolean },
): WorkOrderFacts {
  const created = parseDates(recs, "created_at");
  const closed = parseDates(recs, "closed_at");
  const total = recs.length;

  let closedByStatus = 0;
  let withClosedAt = 0;
  let closedWithoutTime = 0;
  const closedFlags: boolean[] = recs.map((r, i) => {
    const meaning = fields.hasStatusField ? statusMeaning(r.status ?? "") : "unknown";
    const hasTime = closed[i] !== null;
    if (hasTime) withClosedAt++;
    if (meaning === "closed") {
      closedByStatus++;
      if (!hasTime) closedWithoutTime++;
      return true;
    }
    // No usable status column: a closure time is the only evidence of closure.
    return !fields.hasStatusField && hasTime;
  });

  let locationFilled = 0;
  let locatedAsTyped = 0;
  let locatedWithRules = 0;
  let locatedEquipment = 0;
  let roomLike = 0;
  let roomLikeInList = 0;
  const unresolved = new Map<string, number>();
  const locCode: (string | null)[] = recs.map((r) => {
    const text = (r.location ?? "").trim();
    if (!text) return null;
    locationFilled++;
    const token = roomToken(text);
    if (token && master.counts.rooms) {
      roomLike++;
      if (roomExists(token, master)) roomLikeInList++;
    }
    const res = resolveTyped(text, master);
    if (!res) {
      const key = text.toLowerCase();
      unresolved.set(key, (unresolved.get(key) ?? 0) + 1);
      return null;
    }
    if (res.method !== "rule") locatedAsTyped++;
    locatedWithRules++;
    if (res.kind === "equipment") locatedEquipment++;
    return res.code;
  });

  let closedWithNoteField = 0;
  let usableNotes = 0;
  let partNotes = 0;
  if (fields.hasNoteField) {
    recs.forEach((r, i) => {
      if (!closedFlags[i]) return;
      closedWithNoteField++;
      const note = r.closure_note ?? "";
      if (isUsableClosureNote(note, r.description)) {
        usableNotes++;
        if (namesPartOrCause(note)) partNotes++;
      }
    });
  }

  const statusCounts = count(recs.map((r) => r.status ?? ""));
  const statusValues = statusCounts.map((s) => ({ ...s, meaning: statusMeaning(s.value) }));
  const statusUnknown = statusValues.filter((s) => s.meaning === "unknown").reduce((n, s) => n + s.count, 0);

  const categoryCounts = count(recs.map((r) => (r.category ?? "").toLowerCase()));
  const categorised = categoryCounts.reduce((n, c) => n + c.count, 0);
  const largestCategoryShare = categorised ? categoryCounts[0].count / categorised : null;
  const catchAll = categoryCounts.filter((c) => CATCH_ALL_CATEGORY.test(c.value)).reduce((n, c) => n + c.count, 0);
  const catchAllShare = categorised ? catchAll / categorised : null;

  // Duplicates (same place, same category, within 2 hours) and recurrence
  // candidates (a same-category ticket at the same place within 30 days of a closure).
  const byKey = new Map<string, number[]>();
  const keyOf = (i: number) => (locCode[i] && (recs[i].category ?? "").trim() ? `${locCode[i]}\u0000${(recs[i].category ?? "").trim().toLowerCase()}` : null);
  let comparable = 0;
  recs.forEach((_, i) => {
    const k = keyOf(i);
    if (!k || !created[i]) return;
    comparable++;
    byKey.set(k, [...(byKey.get(k) ?? []), toMinutes(created[i]!)]);
  });
  for (const arr of byKey.values()) arr.sort((a, b) => a - b);
  let duplicates2h = 0;
  let closedComparable = 0;
  let recurrence30 = 0;
  recs.forEach((_, i) => {
    const k = keyOf(i);
    if (!k || !created[i]) return;
    const times = byKey.get(k)!;
    const t = toMinutes(created[i]!);
    if (times.some((x) => x < t && t - x <= 120)) duplicates2h++;
    if (closedFlags[i] && closed[i]) {
      closedComparable++;
      const c = toMinutes(closed[i]!);
      if (times.some((x) => x > c && x - c <= 30 * 24 * 60)) recurrence30++;
    }
  });

  // Season coverage by ISO week, and the longest gap between tickets.
  const createdSorted = created.filter((p): p is DateParts => !!p).map(toMinutes).sort((a, b) => a - b);
  const weeks = new Set<string>();
  let maxGapDays: number | null = null;
  let gapInPeak = false;
  if (createdSorted.length) {
    for (const p of created) if (p) weeks.add(isoWeek(p));
    maxGapDays = 0;
    for (let i = 1; i < createdSorted.length; i++) {
      const gap = (createdSorted[i] - createdSorted[i - 1]) / (24 * 60);
      if (gap > maxGapDays) maxGapDays = gap;
      if (gap > 14) {
        const m = new Date(createdSorted[i - 1] * 60000).getUTCMonth() + 1;
        const m2 = new Date(createdSorted[i] * 60000).getUTCMonth() + 1;
        if ([7, 8].includes(m) || [7, 8].includes(m2)) gapInPeak = true;
      }
    }
    maxGapDays = Math.round(maxGapDays * 10) / 10;
  }
  const weeksInSeason = season ? weeksBetween(season.from, season.to) : weeks.size;

  const assignees = recs.map((r) => (r.assigned_to ?? "").trim()).filter(Boolean);
  const assigneesLookLikeNames = assignees.filter((a) => PERSON_NAME.test(a)).length;

  return {
    total,
    hasLocationField: fields.hasLocationField,
    hasNoteField: fields.hasNoteField,
    hasStatusField: fields.hasStatusField,
    closedByStatus,
    withClosedAt,
    closedWithoutTime,
    locationFilled,
    locatedAsTyped,
    locatedWithRules,
    locatedEquipment,
    roomLike,
    roomLikeInList,
    closedWithNoteField,
    usableNotes,
    partNotes,
    statusValues,
    statusUnknown,
    categories: categoryCounts,
    largestCategoryShare,
    catchAllShare,
    comparable,
    duplicates2h,
    closedComparable,
    recurrence30,
    weeksWithTickets: weeks.size,
    weeksInSeason,
    maxGapDays,
    gapInPeak,
    assigneesFilled: assignees.length,
    assigneesLookLikeNames,
    reopenedFilled: recs.filter((r) => (r.reopened ?? "").trim()).length,
    unresolvedTop: [...unresolved.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)).slice(0, 15),
    range: rangeOf(recs, ["created_at"]),
  };
}

function weeksBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.max(1, Math.ceil(((b - a) / 86400000 + 1) / 7));
}

function complaintFacts(recs: Rec[], master: Master): ComplaintFacts {
  let roomFilled = 0;
  let located = 0;
  for (const r of recs) {
    const room = (r.room ?? "").trim();
    if (!room) continue;
    roomFilled++;
    if (resolveTyped(room, master)) located++;
  }
  const dates = parseDates(recs, "occurred_at");
  let timed = 0;
  recs.forEach((r, i) => {
    const p = dates[i];
    if (!p) return;
    const t = (r.time ?? "").trim();
    if (t && withTime(p, t) !== p) timed++;
    else if (p.hour || p.minute) timed++;
  });
  return {
    total: recs.length,
    roomFilled,
    located,
    withNote: recs.filter((r) => (r.resolution ?? "").trim() || (r.agent_note ?? "").trim()).length,
    withStayKey: recs.filter((r) => (r.stay_key ?? "").trim()).length,
    withTime: timed,
    departments: count(recs.map((r) => r.department ?? "")),
    range: rangeOf(recs, ["occurred_at"]),
  };
}

function surveyFacts(recs: Rec[], stays: Rec[] | null): SurveyFacts {
  const withStayKey = recs.filter((r) => (r.stay_key ?? "").trim()).length;
  const withRoomAndDeparture = recs.filter((r) => (r.room ?? "").trim() && (r.departure_date ?? "").trim()).length;
  const linkable = recs.filter((r) => (r.stay_key ?? "").trim() || ((r.room ?? "").trim() && (r.departure_date ?? "").trim())).length;
  let keysChecked: number | null = null;
  let keysInStays: number | null = null;
  const stayKeys = stays ? new Set(stays.map((s) => (s.stay_key ?? "").trim()).filter(Boolean)) : null;
  if (stayKeys && stayKeys.size && withStayKey) {
    keysChecked = withStayKey;
    keysInStays = recs.filter((r) => stayKeys.has((r.stay_key ?? "").trim())).length;
  }
  return {
    total: recs.length,
    withStayKey,
    withRoomAndDeparture,
    linkable,
    keysChecked,
    keysInStays,
    withComment: recs.filter((r) => (r.comment ?? "").trim()).length,
    range: rangeOf(recs, ["submitted_at", "departure_date"]),
  };
}

function reviewFacts(recs: Rec[]): ReviewFacts {
  return {
    total: recs.length,
    withStayDates: recs.filter((r) => (r.stay_dates ?? "").trim()).length,
    withText: recs.filter((r) => (r.text ?? "").trim()).length,
    platforms: count(recs.map((r) => (r.platform ?? "").toLowerCase())),
    range: rangeOf(recs, ["review_date"]),
  };
}

function stayFacts(recs: Rec[], master: Master): StayFacts {
  const arrivals = parseDates(recs, "arrival");
  const departures = parseDates(recs, "departure");
  let nights = 0;
  recs.forEach((r, i) => {
    const n = Number((r.nights ?? "").trim());
    if ((r.nights ?? "").trim() && Number.isFinite(n) && n >= 0) nights += n;
    else if (arrivals[i] && departures[i]) nights += Math.max(0, Math.round((toMinutes(departures[i]!) - toMinutes(arrivals[i]!)) / (24 * 60)));
  });
  const rooms = new Set(recs.map((r) => (r.room ?? "").trim().toUpperCase()).filter(Boolean));
  const roomsInList = master.counts.rooms ? [...rooms].filter((r) => roomExists(r, master) || !!resolveTyped(r, master)).length : null;
  return {
    total: recs.length,
    nights,
    distinctKeys: new Set(recs.map((r) => (r.stay_key ?? "").trim()).filter(Boolean)).size,
    roomsDistinct: rooms.size,
    roomsInList,
    range: rangeOf(recs, ["arrival", "departure"]),
  };
}

function occupancyFacts(recs: Rec[]): OccupancyFacts {
  const dates = parseDates(recs, "date");
  const days = new Set<string>();
  let roomNights = 0;
  recs.forEach((r, i) => {
    if (dates[i]) days.add(toIsoDate(dates[i]!));
    const n = Number((r.rooms_occupied ?? "").replace(",", "."));
    if (Number.isFinite(n)) roomNights += n;
  });
  const range = rangeOf(recs, ["date"]);
  const spanDays = range ? Math.round((Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / 86400000) + 1 : 0;
  return { total: recs.length, days: days.size, spanDays, roomNights: Math.round(roomNights), range };
}

function scanPii(projected: Projected[]): Facts["pii"] {
  const identityColumns: { file: string; column: string }[] = [];
  let textRows = 0;
  let textRowsWithPii = 0;
  for (const p of projected) {
    for (const c of p.report.identityColumns) identityColumns.push({ file: p.file.path, column: c });
    if (!p.mapping || p.report.dataset === "unknown") continue;
    const spec = DATASET_BY_KEY[p.report.dataset];
    if (!spec?.textFields.length) continue;
    const step = Math.max(1, Math.floor(p.records.length / 3000));
    for (let i = 0; i < p.records.length; i += step) {
      const text = spec.textFields.map((f) => p.records[i][f] ?? "").filter(Boolean).join("\n");
      if (!text.trim()) continue;
      textRows++;
      if (Object.keys(scrubPii(text).redactions).length) textRowsWithPii++;
    }
  }
  return { identityColumns, textRows, textRowsWithPii };
}
