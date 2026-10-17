import { parse } from "csv-parse/sync";
import { access, copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dataDir } from "@/db/scripts/lib/paths";
import { DATASET_BY_KEY } from "../catalogue";
import { classifyDate, readDateColumn } from "../dates";
import { decodeBytes, detectDelimiter, detectHeaderRow } from "../detect";
import { classifyFile, normalizeHeader, scoreHeader } from "../headers";
import { buildReport, readExportFolder, renderMemo, type Facts, type FileReport, type ParsedFile, type RealityReport, type UnreadFile } from "../index";

/**
 * The reality check on the synthetic season (data/out, from `python -m
 * generator` in data/) and on a deliberately broken copy of it. No database.
 */

const fixture = dataDir();
let input: { files: ParsedFile[]; unread: UnreadFile[] };
let report: RealityReport;
let facts: Facts;
let memo: string;

const file = (name: string): FileReport => {
  const f = report.files.find((x) => x.path === name);
  if (!f) throw new Error(`${name} not in the report`);
  return f;
};
const field = (f: FileReport, key: string) => f.fields.find((x) => x.field === key)!;
const measure = (key: string) => report.measures.find((m) => m.key === key)!;
const dimension = (d: string) => report.scorecard.find((x) => x.dimension === d)!;

beforeAll(async () => {
  try {
    await access(path.join(fixture, "work_orders.csv"));
  } catch {
    throw new Error(`synthetic exports missing at ${fixture}; run: uv run --project data python -m generator --seed 42 --out data/out/`);
  }
  input = await readExportFolder(fixture);
  const built = buildReport(input, fixture, new Date("2026-12-01T09:00:00Z"));
  report = built.report;
  facts = built.facts;
  memo = renderMemo(report);
});

describe("format detection", () => {
  it("reads the ticketing export: semicolon, BOM, CRLF, Greek-locale dates, three staff languages", () => {
    const wo = file("work_orders.csv");
    expect(wo.detection.format).toBe("csv");
    expect(wo.detection.delimiter).toBe(";");
    expect(wo.detection.bom).toBe(true);
    expect(wo.detection.encoding).toBe("UTF-8 with BOM");
    expect(wo.detection.lineEndings).toBe("CRLF");
    expect(wo.detection.headerRow).toBe(1);
    expect(wo.rows).toBe(1148);
    expect(wo.dateFormats.find((d) => d.column === "Created")?.format).toBe("DD/MM/YYYY HH:MM");
    expect(wo.dateFormats.find((d) => d.column === "Closed")?.format).toBe("DD/MM/YYYY HH:MM");
    expect(wo.dateRange).toEqual({ from: "2026-04-02", to: "2026-10-31", column: "Created" });
    const languages = wo.languages.find((l) => l.column === "Description")!.mix;
    const share = (name: string) => languages.find((m) => m.language === name)?.share ?? 0;
    expect(share("English")).toBeGreaterThan(0.4);
    expect(share("Greek")).toBeGreaterThan(0.15);
    expect(share("Greeklish")).toBeGreaterThan(0.08);
  });

  it("reads the front-desk workbook: one sheet per month, title rows, header on row 3, Excel dates plus text times", () => {
    const fd = file("front_desk_log.xlsx");
    expect(fd.detection.format).toBe("xlsx");
    expect(fd.detection.sheets.map((s) => s.name)).toEqual(["April", "May", "June", "July", "August", "September", "October"]);
    expect(fd.detection.oneSheetPerMonth).toBe(true);
    expect(fd.detection.headerRow).toBe(3);
    expect(fd.detection.sheets[0].title).toMatch(/April 2026/);
    expect(fd.rows).toBe(483);
    expect(fd.dateFormats.find((d) => d.column === "Date")?.format).toBe("Excel date cells");
    expect(fd.dateFormats.find((d) => d.column === "Time")?.format).toBe("HH:MM text");
    expect(fd.dateRange?.from).toBe("2026-04-01");
  });

  it("reads the survey and PMS exports: comma, LF, no BOM, ISO dates", () => {
    const sv = file("surveys.csv");
    expect(sv.detection.delimiter).toBe(",");
    expect(sv.detection.bom).toBe(false);
    expect(sv.detection.lineEndings).toBe("LF");
    expect(sv.dateFormats.find((d) => d.column === "checkout_date")?.format).toBe("YYYY-MM-DD");
    const st = file("stays.csv");
    expect(st.rows).toBe(8241);
    expect(st.dateFormats.map((d) => d.column).sort()).toEqual(["booked_on", "check_in", "check_out"]);
  });

  it("reads the review aggregator JSON: three record shapes, zoned timestamps, month-only stay dates", () => {
    const rv = file("reviews.json");
    expect(rv.detection.format).toBe("json");
    expect(rv.detection.jsonShape).toMatch(/under “reviews”, 653 records, 3 record shape/);
    expect(rv.detection.jsonShape).toMatch(/booking/);
    expect(rv.rows).toBe(653);
    expect(rv.dateFormats.find((d) => d.column === "date")?.format).toMatch(/ISO 8601 datetime with zone/);
    expect(rv.dateFormats.find((d) => d.column === "date_of_stay")?.format).toBe("Month YYYY (month only)");
    expect(rv.dateFormats.find((d) => d.column === "stay_month")?.format).toBe("Month YYYY (month only)");
  });
});

describe("dataset recognition and field mapping", () => {
  it("recognises the nine exports and lists the answer key as a report, not a table", () => {
    const got = Object.fromEntries(report.files.map((f) => [f.path, f.dataset]));
    expect(got).toEqual({
      "equipment.csv": "equipment",
      "facilities.csv": "facilities",
      "front_desk_log.xlsx": "complaints",
      "occupancy_daily.csv": "occupancy",
      "reviews.json": "reviews",
      "rooms.csv": "rooms",
      "stays.csv": "stays",
      "surveys.csv": "surveys",
      "work_orders.csv": "work_orders",
    });
    expect(report.unread.map((u) => u.path)).toEqual(["answer_key.json"]);
    expect(report.unread[0].reason).toMatch(/nested document with 2 lists of records \(issues, signals\), a report rather than a table/);
    expect(report.files.filter((f) => f.lowConfidence)).toEqual([]);
    expect(report.datasets.filter((d) => d.status === "missing").map((d) => d.dataset)).toEqual(["compensation", "sops"]);
  });

  it("maps the ticketing columns onto the data request without knowing their names", () => {
    const wo = file("work_orders.csv");
    const col = (key: string) => field(wo, key).columns;
    expect(col("id")).toEqual(["Ticket No"]);
    expect(col("created_at")).toEqual(["Created"]);
    expect(col("closed_at")).toEqual(["Closed"]);
    expect(col("location")).toEqual(["Location"]);
    expect(col("category")).toEqual(["Category"]);
    expect(col("description")).toEqual(["Description"]);
    expect(col("closure_note")).toEqual(["Closure Note"]);
    expect(col("status")).toEqual(["Status"]);
    expect(col("assigned_to")).toEqual(["Technician"]);
    expect(col("created_by")).toEqual(["Reported By"]);
    expect(col("priority")).toEqual(["Priority"]);
    expect(col("reopened")).toEqual(["Reopened"]);
    expect(field(wo, "reported_via").method).toBe("missing");
    expect(wo.unmappedColumns).toEqual([]);
  });

  it("maps the front-desk columns, including the running number and the original comment", () => {
    const fd = file("front_desk_log.xlsx");
    const col = (key: string) => field(fd, key).columns;
    expect(col("id")).toEqual(["#"]);
    expect(col("occurred_at")).toEqual(["Date"]);
    expect(col("time")).toEqual(["Time"]);
    expect(col("room")).toEqual(["Room"]);
    expect(col("description")).toEqual(["Guest comment (original)"]);
    expect(col("resolution")).toEqual(["Resolution"]);
    expect(col("agent_note")).toEqual(["Agent note"]);
    expect(col("department")).toEqual(["Dept"]);
    expect(field(fd, "stay_key").method).toBe("missing");
  });

  it("maps surveys and reviews, joining split columns and keeping the room score out of the room field", () => {
    const sv = file("surveys.csv");
    expect(field(sv, "stay_key").columns).toEqual(["reservation_no"]);
    expect(field(sv, "departure_date").columns).toEqual(["checkout_date"]);
    expect(field(sv, "overall").columns).toEqual(["overall"]);
    expect(field(sv, "comment").columns).toEqual(["comment"]);
    expect(field(sv, "room").method).toBe("missing");
    expect(field(sv, "topic_scores").columns).toContain("room");
    expect(field(sv, "topic_scores").columns).toContain("cleanliness");
    const rv = file("reviews.json");
    expect(field(rv, "platform").columns).toEqual(["platform"]);
    expect(field(rv, "review_date").columns.sort()).toEqual(["date", "published"]);
    expect(field(rv, "stay_dates").columns.sort()).toEqual(["date_of_stay", "stay_month"]);
    expect(field(rv, "rating").columns.sort()).toEqual(["rating", "score"]);
    expect(field(rv, "text").columns.sort()).toEqual(["negative", "positive", "text"]);
    expect(field(rv, "management_response").columns).toEqual(["owner_reply"]);
  });

  it("reads the master data into a location index", () => {
    expect(facts.master.counts).toEqual({ rooms: 298, villas: 20, buildings: 5, floors: 11, facilities: 11, equipment: 25, equipmentWithServes: 25 });
  });
});

describe("coverage on the full season", () => {
  it("measures what the scorecard asks for", () => {
    const wo = facts.wo!;
    expect(wo.locatedWithRules / wo.total).toBeGreaterThan(0.9);
    expect(wo.locatedAsTyped / wo.total).toBeGreaterThan(0.6);
    expect(wo.closedByStatus).toBe(1110);
    expect(wo.closedWithoutTime).toBe(0);
    expect(wo.usableNotes / wo.closedWithNoteField).toBeGreaterThan(0.5);
    expect(wo.usableNotes / wo.closedWithNoteField).toBeLessThan(0.9);
    expect(wo.statusValues.length).toBe(15);
    expect(wo.statusValues.filter((s) => s.meaning === "closed").reduce((n, s) => n + s.count, 0)).toBe(1110);
    expect(wo.statusValues.filter((s) => s.meaning === "unknown")).toEqual([]);
    expect(wo.categories.length).toBe(12);
    expect(wo.largestCategoryShare).toBeLessThan(0.3);
    expect(wo.recurrence30 / wo.closedComparable).toBeGreaterThan(0.04);
    expect(wo.recurrence30 / wo.closedComparable).toBeLessThan(0.25);
    expect(wo.duplicates2h / wo.comparable).toBeLessThan(0.1);
    expect(wo.weeksWithTickets).toBe(wo.weeksInSeason);
    expect(wo.assigneesLookLikeNames).toBe(0);

    const fd = facts.fd!;
    expect(fd.roomFilled / fd.total).toBeGreaterThan(0.95);
    expect(fd.located / fd.total).toBeGreaterThan(0.95);
    expect(fd.withNote / fd.total).toBeGreaterThan(0.5);

    const sv = facts.sv!;
    expect(sv.withStayKey).toBe(2598);
    expect(sv.keysInStays).toBe(2598);
    expect(sv.withRoomAndDeparture).toBe(0);

    const rv = facts.rv!;
    expect(rv.withStayDates).toBe(263 + 143);
    expect(rv.platforms.map((p) => p.value).sort()).toEqual(["booking", "google", "tripadvisor"]);

    expect(facts.oc!.roomNights).toBe(44117);
    expect(facts.st!.nights).toBe(44117);
    expect(facts.season).toEqual({ from: "2026-04-01", to: "2026-10-31", basis: "occupancy by day" });
    expect(facts.pii.identityColumns).toEqual([]);
    expect(facts.pii.textRowsWithPii).toBe(0);
  });

  it("says go, with volume the only amber dimension", () => {
    expect(report.decision.verdict).toBe("go");
    expect(report.decision.stopConditions).toEqual([]);
    expect(report.scorecard.map((d) => `${d.dimension}:${d.colour}`)).toEqual(["D1:green", "D2:green", "D3:green", "D4:green", "D5:amber", "D6:green"]);
    expect(dimension("D5").rows.filter((r) => r.colour === "amber").map((r) => r.measure)).toEqual(["Work orders per occupied room-night", "Work orders, absolute"]);
    expect(measure("wo_location").share).toBeGreaterThan(0.9);
    expect(measure("rv_stay_dates").verdict).toBe("info");
    expect(report.asks.some((a) => /reported via/.test(a.text))).toBe(true);
    expect(report.asks.some((a) => /answer_key\.json/.test(a.text))).toBe(false);
  });

  it("renders a memo with the verdict, the scorecard and no personal data", () => {
    expect(memo).toContain("## Verdict: GO");
    expect(memo).toContain("| **D5** Coverage and volume | Amber |");
    expect(memo).toContain("### `work_orders.csv` → Work orders (must have)");
    expect(memo).toContain("semicolon-separated, UTF-8 with BOM, CRLF line endings");
    expect(memo).toContain("one sheet per month");
    expect(memo).toContain("## Reshaping asks for the client");
    expect(memo).toContain("## Data gaps log");
    // Staff codes, reservation numbers and guest text never reach the memo.
    expect(memo).not.toMatch(/\bT-0\d\b/);
    expect(memo).not.toMatch(/\b26\d{5}\b/);
    expect(memo).not.toMatch(/passports are inside/);
  });
});

describe("a deliberately broken export", () => {
  let dir: string;
  let broken: { report: RealityReport; facts: Facts; memo: string };

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "reality-broken-"));
    for (const name of await readdir(fixture)) {
      if (name === "answer_key.json" || name === "reality-check" || name.startsWith(".")) continue;
      if (name === "work_orders.csv") {
        // Two headers renamed to something no synonym covers.
        const text = await readFile(path.join(fixture, name), "utf8");
        const [header, ...rest] = text.split("\r\n");
        const renamed = header.replace("Location", "Col 4").replace("Closure Note", "Col 7");
        expect(renamed).not.toBe(header);
        await writeFile(path.join(dir, name), [renamed, ...rest].join("\r\n"));
      } else if (name === "surveys.csv") {
        // The reservation number dropped from the survey export.
        const rows = parse(await readFile(path.join(fixture, name), "utf8"), { relax_column_count: true }) as string[][];
        const idx = rows[0].indexOf("reservation_no");
        expect(idx).toBeGreaterThanOrEqual(0);
        const out = rows.map((r) => r.filter((_, i) => i !== idx).map(csvCell).join(",")).join("\n");
        await writeFile(path.join(dir, name), `${out}\n`);
      } else {
        await copyFile(path.join(fixture, name), path.join(dir, name));
      }
    }
    const read = await readExportFolder(dir);
    const built = buildReport(read, dir, new Date("2026-12-01T09:00:00Z"));
    broken = { ...built, memo: renderMemo(built.report) };
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("still recognises every dataset and reports the fields it could not map", () => {
    const wo = broken.report.files.find((f) => f.path === "work_orders.csv")!;
    expect(wo.dataset).toBe("work_orders");
    expect(wo.fields.find((f) => f.field === "location")?.method).toBe("missing");
    expect(wo.fields.find((f) => f.field === "closure_note")?.method).toBe("missing");
    expect(wo.unmappedColumns.sort()).toEqual(["Col 4", "Col 7"]);
    const sv = broken.report.files.find((f) => f.path === "surveys.csv")!;
    expect(sv.dataset).toBe("surveys");
    expect(sv.fields.find((f) => f.field === "stay_key")?.method).toBe("missing");
    expect(broken.facts.missingFields.find((m) => m.dataset === "work_orders")?.fields.map((f) => f.field).sort()).toEqual(["closure_note", "location", "reported_via"]);
  });

  it("says reshape, not stop, and asks for exactly what is missing", () => {
    expect(broken.report.decision.verdict).toBe("reshape");
    expect(broken.report.decision.stopConditions).toEqual([]);
    expect(broken.report.scorecard.find((d) => d.dimension === "D1")!.colour).toBe("na");
    expect(broken.report.scorecard.find((d) => d.dimension === "D2")!.colour).toBe("na");
    expect(broken.report.scorecard.find((d) => d.dimension === "D1")!.rows.find((r) => /Work orders with a location/.test(r.measure))!.colour).toBe("na");
    expect(broken.report.scorecard.find((d) => d.dimension === "D2")!.rows.find((r) => /usable closure note/.test(r.measure))!.colour).toBe("na");
    expect(broken.report.scorecard.find((d) => d.dimension === "D4")!.colour).toBe("red");
    expect(broken.facts.sv!.linkable).toBe(0);
    const asks = broken.report.asks.map((a) => a.text);
    expect(asks.some((t) => /could not find a location column in the work-order export/.test(t))).toBe(true);
    expect(asks.some((t) => /could not find a closure-note column/.test(t))).toBe(true);
    expect(asks.some((t) => /Keep the reservation surrogate key on the survey export/.test(t))).toBe(true);
    expect(asks.some((t) => /Work orders \(work_orders\.csv\): we could not find the fields “reported via”, “location as recorded”, “closure note”/.test(t))).toBe(true);
    expect(asks.filter((t) => /join to stays/.test(t))).toEqual([]);
    expect(broken.memo).toContain("## Verdict: RESHAPE");
    expect(broken.memo).toContain("Minimum fields not found: **reported via**, **location as recorded**, **closure note**");
  });
});

describe("stray files in the folder", () => {
  let dir: string;
  let decoyed: { report: RealityReport; facts: Facts };

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "reality-decoys-"));
    for (const name of await readdir(fixture)) {
      if (name === "answer_key.json" || name.startsWith(".")) continue;
      await copyFile(path.join(fixture, name), path.join(dir, name));
    }
    // An old audit output left in the folder: a winter-works list whose columns overlap the tickets, and a nested report.
    await mkdir(path.join(dir, "audit"));
    const header = "rank;priority;issue;topic;category;location;kind;episodes;reopens;closures;repeat_tickets;rooms_affected;guest_reports;first;last;evidence";
    const rows = [
      "1;96;Sea Wing hot water;no_hot_water;plumbing;C-BOILER;equipment;3;1;3;2;5;7;2026-06-02;2026-09-14;3 episodes, 7 guest reports",
      "2;60;Villa 12 AC;ac_not_cooling;hvac;V12;room;3;0;3;2;1;4;2026-06-20;2026-08-30;3 episodes, 4 guest reports",
      "3;24;Lobby lift;elevator_stuck;elevator;A-LIFT-1;equipment;2;1;3;2;0;3;2026-05-11;2026-09-02;2 episodes, 3 guest reports",
    ];
    await writeFile(path.join(dir, "audit", "winter-works.csv"), `\ufeff${[header, ...rows].join("\r\n")}\r\n`);
    const nested = {
      version: "audit-v1",
      generatedAt: "2026-12-01T09:00:00Z",
      property: { code: "ASTRAEA", name: "Astraea Bay Resort & Villas", timezone: "Europe/Athens" },
      season: { from: "2026-04-01", to: "2026-10-31", label: "Season 2026" },
      volume: { signalsTotal: 4882, bySource: [{ source: "work_order", count: 1148 }, { source: "front_desk", count: 483 }] },
      recurring: rows.map((r, i) => ({ issueId: `ISS-0${i + 1}`, title: r.split(";")[2], topic: r.split(";")[3], category: r.split(";")[4], status: "open", locationCode: r.split(";")[5], episodes: 3, reopens: 1, closures: 3, firstAt: "2026-06-02", lastAt: "2026-09-14" })),
      fixesHeld: { total: { closures: 1110, back7: 40, back30: 104, back90: 160 }, byMonth: [{ month: "2026-06", closures: 180, back7: 6, back30: 17, back90: 25 }] },
    };
    await writeFile(path.join(dir, "audit", "audit.json"), JSON.stringify(nested, null, 2));
    const read = await readExportFolder(dir);
    decoyed = buildReport(read, dir, new Date("2026-12-01T09:00:00Z"));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("keeps the ticket export to the real file and sets the decoys aside", () => {
    const wo = decoyed.report.datasets.find((d) => d.dataset === "work_orders")!;
    expect(wo.files).toEqual(["work_orders.csv"]);
    expect(wo.rows).toBe(1148);
    expect(decoyed.facts.wo!.total).toBe(1148);
    const decoy = decoyed.report.files.find((f) => f.path === "audit/winter-works.csv")!;
    expect(decoy.dataset).toBe("unknown");
    expect(decoy.lowConfidence?.dataset).toBe("work_orders");
    expect(decoy.lowConfidence?.matched).toEqual(expect.arrayContaining(["location as recorded", "category or trade", "short description"]));
    expect(decoy.lowConfidence?.why).toMatch(/identifying columns \(job id, created at, closed at, status\)/);
    const nested = decoyed.report.unread.find((u) => u.path === "audit/audit.json")!;
    expect(nested.reason).toMatch(/nested document with 3 lists of records \(volume\.bySource, recurring, fixesHeld\.byMonth\), a report rather than a table/);
    expect(decoyed.report.asks.some((a) => /audit\/winter-works\.csv \(3 rows\) looked like work orders/.test(a.text))).toBe(true);
    expect(renderMemo(decoyed.report)).toContain("Files recognised with low confidence, left out of every count above:");
  });

  it("leaves the verdict and the scorecard unchanged", () => {
    expect(decoyed.report.decision.verdict).toBe("go");
    expect(decoyed.report.scorecard.map((d) => `${d.dimension}:${d.colour}`)).toEqual(report.scorecard.map((d) => `${d.dimension}:${d.colour}`));
    expect(decoyed.report.measures.map((m) => [m.key, m.value])).toEqual(report.measures.map((m) => [m.key, m.value]));
  });

  it("does not let a file name waive the identifying columns", () => {
    // Same decoy columns, but the file is called like a ticket export: still not taken.
    const cls = classifyFile({ ...decoyedParsed("audit/winter-works.csv"), path: "work_orders_export.csv" });
    expect(cls.dataset).toBe("unknown");
    expect(cls.lookedLike?.dataset).toBe("work_orders");
  });

  function decoyedParsed(name: string): ParsedFile {
    const header = ["rank", "priority", "issue", "topic", "category", "location", "kind", "episodes", "reopens", "closures", "repeat_tickets", "rooms_affected", "guest_reports", "first", "last", "evidence"];
    const rows = [
      ["1", "96", "Sea Wing hot water", "no_hot_water", "plumbing", "C-BOILER", "equipment", "3", "1", "3", "2", "5", "7", "2026-06-02", "2026-09-14", "3 episodes"],
      ["2", "60", "Villa 12 AC", "ac_not_cooling", "hvac", "V12", "room", "3", "0", "3", "2", "1", "4", "2026-06-20", "2026-08-30", "3 episodes"],
    ].map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
    return { path: name, detection: decoyed.report.files.find((f) => f.path === name)!.detection, columns: header, rows, cellKinds: {} };
  }
});

describe("helpers", () => {
  it("normalises headers and scores spellings", () => {
    expect(normalizeHeader("Closure Note (free text)")).toBe("closure note free text");
    expect(normalizeHeader("#")).toBe("no");
    expect(normalizeHeader("Ημ/νία_Δημιουργίας")).toBe("ημ νια δημιουργιας");
    const wo = DATASET_BY_KEY.work_orders;
    const f = (key: string) => wo.fields.find((x) => x.key === key)!;
    expect(scoreHeader("Ticket No", f("id"))).toEqual({ confidence: 1, method: "synonym" });
    expect(scoreHeader("Closure Note", f("closure_note"))).toEqual({ confidence: 1, method: "exact" });
    expect(scoreHeader("Closure notes (technician)", f("closure_note"))?.confidence).toBe(0.85);
    expect(scoreHeader("Technician", f("assigned_to"))?.confidence).toBe(1);
    expect(scoreHeader("Col 4", f("location"))).toBeNull();
    expect(scoreHeader("Locatoin", f("location"))).toEqual({ confidence: 0.75, method: "fuzzy" });
    expect(scoreHeader("Closed", f("created_at"))).toBeNull();
  });

  it("classifies dates and settles the day/month order per column", () => {
    expect(classifyDate("17/10/2026 14:05")?.format).toBe("DD/MM/YYYY HH:MM");
    expect(classifyDate("2026-07-01T08:52:00Z")?.format).toBe("ISO 8601 datetime with zone");
    expect(classifyDate("July 2026")?.parts).toMatchObject({ year: 2026, month: 7, monthOnly: true });
    expect(classifyDate("Ιούλιος 2026")?.parts.month).toBe(7);
    expect(classifyDate("12.08.2026")?.format).toBe("DD.MM.YYYY");
    expect(classifyDate("45500")?.format).toBe("Excel serial number");
    expect(classifyDate("312")).toBeNull();
    expect(classifyDate("done")).toBeNull();
    expect(readDateColumn(["03/04/2026", "10/04/2026"]).format).toMatch(/assumed/);
    expect(readDateColumn(["13/04/2026", "04/13/2026"]).format).toMatch(/inconsistent/);
    const us = readDateColumn(["04/13/2026", "04/20/2026", "05/02/2026"]);
    expect(us.monthFirst).toBe(true);
    expect(us.parsed[2]).toMatchObject({ month: 5, day: 2 });
  });

  it("detects encoding, delimiter and header row", () => {
    const greek = new Uint8Array([0xc4, 0xf9, 0xec, 0x2e, 0x20, 0x33, 0x31, 0x32]); // "Δωμ. 312" in Windows-1253
    const d = decodeBytes(greek);
    expect(d.encoding).toBe("Windows-1253 (Greek, not UTF-8)");
    expect(d.text).toBe("Δωμ. 312");
    expect(decodeBytes(new Uint8Array([0xef, 0xbb, 0xbf, 0x61])).encoding).toBe("UTF-8 with BOM");
    expect(detectDelimiter("a;b;c\n1;2;3\n4;5;6")).toBe(";");
    expect(detectDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t");
    expect(detectDelimiter('a,b,c\n"1,5",2,3')).toBe(",");
    expect(detectHeaderRow([["Guest log April"], [], ["#", "Date", "Room"], ["1", "2026-04-01", "259"]])).toBe(3);
    expect(detectHeaderRow([["id", "created", "room"], ["1", "2026-04-01", "259"]])).toBe(1);
  });
});

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
