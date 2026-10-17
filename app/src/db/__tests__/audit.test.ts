import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db, type TenantContext } from "../index";
import { findProperty } from "../scripts/seed";
import { renderMarkdown, renderWinterWorksCsv } from "@/audit/markdown";
import { addNarrative, createFakeNarrator } from "@/audit/narrative";
import { buildAuditReport, quantile } from "@/audit/report";
import type { AuditReport } from "@/audit/types";
import { linkSignals } from "@/link/pipeline";
import { createFakeLlm } from "@/normalize/llm";
import { TEST_APP_URL, TEST_URL } from "./env";

let admin: Db;
let app: Db;
let ctx: TenantContext;
let report: AuditReport;

beforeAll(async () => {
  admin = createDb(TEST_URL, { max: 1 });
  app = createDb(TEST_APP_URL, { max: 2 });
  const p = await findProperty(admin);
  if (!p) throw new Error("seed missing");
  ctx = { groupId: p.groupId, propertyIds: [p.id] };
  // The global setup loads and normalises; issues come from the linker.
  await linkSignals(admin, { llm: createFakeLlm() });
  report = await buildAuditReport(app, ctx);
});

afterAll(async () => {
  await app.$client.end();
  await admin.$client.end();
});

describe("season audit (through the app role and RLS)", () => {
  it("covers the property's season and counts every source", () => {
    expect(report.season.from).toBe("2026-04-01");
    expect(report.season.to).toBe("2026-10-31");
    expect(report.season.label).toBe("2026 season");
    const sources = report.volume.bySource.map((s) => s.source).sort();
    expect(sources).toEqual(["front_desk", "review", "survey", "work_order"]);
    expect(report.volume.signalsTotal).toBe(report.volume.bySource.reduce((n, s) => n + s.count, 0));
    expect(report.volume.signalsTotal).toBeGreaterThan(4000);
    expect(report.volume.issues).toBeGreaterThan(500);
    expect(report.volume.issuesRecurring).toBeGreaterThan(20);
    expect(report.volume.byLocationKind.reduce((n, k) => n + k.issues, 0)).toBe(report.volume.issues);
    expect(report.volume.roomNights).toBeGreaterThan(10_000);
  });

  it("has a baseline that adds up", () => {
    const b = report.baseline;
    expect(b.closures).toBe(report.fixesHeld.total.closures);
    expect(b.held30 + report.fixesHeld.total.back30).toBe(b.closures);
    expect(b.held30Share).toBeGreaterThan(0.5);
    expect(b.held30Share).toBeLessThan(1);
    expect(b.repeatsPerThousandRoomNights).toBeGreaterThan(0);
    expect(b.reopenRate).toBeGreaterThan(0);
    expect(b.medianHoursToResolve).toBeGreaterThan(0);
  });

  it("ranks recurring failures and finds the shared-plant causes", () => {
    const rec = report.recurring;
    expect(rec.length).toBeGreaterThan(10);
    for (let i = 1; i < rec.length; i++) {
      expect(rec[i - 1].episodes + rec[i - 1].reopens).toBeGreaterThanOrEqual(rec[i].episodes + rec[i].reopens);
    }
    expect(rec.every((f) => f.episodes >= 2 || f.reopens >= 1)).toBe(true);
    const plant = rec.filter((f) => f.locationKind === "equipment" || f.locationKind === "building");
    expect(plant.length).toBeGreaterThanOrEqual(5);
    expect(plant.some((f) => f.roomsAffected >= 5)).toBe(true);
    expect(rec.every((f) => f.firstAt <= f.lastAt && f.guestReports === f.deskComplaints + f.surveyMentions + f.reviewMentions)).toBe(true);
  });

  it("splits fixes-held and time-to-resolve by category and month consistently", () => {
    const fh = report.fixesHeld;
    expect(fh.byCategory.reduce((n, c) => n + c.closures, 0)).toBe(fh.total.closures);
    expect(fh.byMonth.reduce((n, m) => n + m.back30, 0)).toBe(fh.total.back30);
    expect(fh.total.back7).toBeLessThanOrEqual(fh.total.back30);
    expect(fh.total.back30).toBeLessThanOrEqual(fh.total.back90);
    expect(fh.byMonth.map((m) => m.month)).toEqual([...fh.byMonth.map((m) => m.month)].sort());
    const t = report.timeToResolve;
    expect(t.firstHalf.tickets + t.secondHalf.tickets).toBe(t.byMonth.reduce((n, m) => n + m.tickets, 0));
    expect(t.byCategory.reduce((n, c) => n + c.tickets, 0)).toBe(t.firstHalf.tickets + t.secondHalf.tickets);
    for (const c of t.byCategory) expect((c.p90Hours ?? 0) >= (c.medianHours ?? 0)).toBe(true);
  });

  it("ties guest voice to tickets and finds what never became one", () => {
    const v = report.guestVoice;
    expect(v.bySource.map((s) => s.source).sort()).toEqual(["front_desk", "review", "survey"]);
    for (const s of v.bySource) {
      expect(s.withTicket).toBeLessThanOrEqual(s.linked);
      expect(s.linked).toBeLessThanOrEqual(s.withTopic);
    }
    expect(v.byTopic.length).toBeGreaterThan(5);
    expect(v.byTopic[0].mentions).toBeGreaterThanOrEqual(v.byTopic[1].mentions);
    expect(v.silent.length).toBeGreaterThan(0);
    for (const s of v.silent) {
      expect(s.withTicket / s.mentions).toBeLessThan(0.25);
      expect(s.examples.length).toBeGreaterThan(0);
      expect(s.examples.length).toBeLessThanOrEqual(2);
    }
    expect(v.surveys.withLinkedIssue.responses + v.surveys.others.responses).toBeGreaterThan(1000);
  });

  it("builds a winter-works list with an evidence line per item", () => {
    const w = report.winterWorks;
    expect(w.length).toBe(20);
    expect(w.map((x) => x.rank)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    for (let i = 1; i < w.length; i++) expect(w[i - 1].priority).toBeGreaterThanOrEqual(w[i].priority);
    for (const x of w) {
      expect(x.priority).toBe((x.episodes + x.reopens) * (1 + x.guestReports) * (1 + x.repeatTickets));
      expect(x.evidence).toMatch(/episode/);
      expect(x.evidence).toMatch(/guest report/);
    }
  });

  it("assesses the records and gives five changes", () => {
    const rec = report.records;
    expect(rec.metrics.length).toBe(12);
    expect(rec.recommendations.length).toBe(5);
    expect(new Set(rec.recommendations).size).toBe(5);
    const notes = rec.metrics.find((m) => m.key === "closure_notes")!;
    expect(notes.total).toBeGreaterThan(500);
    expect(["good", "weak", "poor"]).toContain(notes.verdict);
    const desk = rec.metrics.find((m) => m.key === "desk_to_ticket")!;
    expect(desk.share).not.toBeNull();
  });

  it("narrows to a window when asked", async () => {
    const july = await buildAuditReport(app, ctx, { from: "2026-07-01", to: "2026-07-31", label: "July 2026" });
    expect(july.season.label).toBe("July 2026");
    expect(july.volume.signalsTotal).toBeLessThan(report.volume.signalsTotal / 3);
    expect(july.fixesHeld.byMonth.map((m) => m.month)).toEqual(["2026-07"]);
    expect(july.timeToResolve.byMonth.map((m) => m.month)).toEqual(["2026-07"]);
  });
});

describe("renderers", () => {
  it("writes the markdown with the seven sections and names no person", () => {
    const md = renderMarkdown(report);
    for (const h of ["## Baseline", "## 1. Recurring failures", "## 2. Fixes that did not hold", "## 3. Time to resolve", "## 4. Reviews and surveys", "## 5. Winter-works list", "## 6. Records assessment"]) {
      expect(md).toContain(h);
    }
    expect(md).not.toMatch(/\bT-\d\d\b/);
    expect(md).not.toMatch(/\bEXT-[A-Z]+\b/);
    expect(md).toContain(report.recurring[0].title);
    expect(md).toContain("not by technician");
  });

  it("writes the winter-works spreadsheet with a BOM and one row per item", () => {
    const csv = renderWinterWorksCsv(report);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).trimEnd().split("\r\n");
    expect(lines.length).toBe(report.winterWorks.length + 1);
    expect(lines[0]).toBe("rank;priority;issue;topic;category;location;kind;episodes;reopens;closures;repeat_tickets;rooms_affected;guest_reports;first;last;evidence");
    expect(lines[1].startsWith("1;")).toBe(true);
  });

  it("adds a narrative from the facts without touching the figures", async () => {
    const withNarrative = await addNarrative(report, createFakeNarrator());
    expect(withNarrative.narrative?.model).toBe("fake");
    expect(withNarrative.narrative?.highlights.length).toBeGreaterThanOrEqual(3);
    expect(withNarrative.narrative?.summary).toContain(report.recurring[0].title);
    expect(withNarrative.baseline).toEqual(report.baseline);
    expect(renderMarkdown(withNarrative)).toContain("## Summary");
  });

  it("quantile interpolates like percentile_cont", () => {
    expect(quantile([], 0.5)).toBeNull();
    expect(quantile([4], 0.5)).toBe(4);
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([10, 1, 5], 0.9)).toBe(9);
  });
});
