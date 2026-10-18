import type { AuditReport, RecurringFailure } from "./types";
import { categoryLabel } from "@/console/format";
import { label as dictLabel } from "@/i18n";
import { CATEGORIES } from "@/normalize/taxonomy";

/**
 * The written report, as Markdown. Section order follows the offer
 * (docs/discovery/04-audit-offer.md); the page renders the same data with
 * the same headings so the two never disagree.
 */
export function renderMarkdown(r: AuditReport): string {
  const out: string[] = [];
  const h = (level: number, text: string) => out.push(`${"#".repeat(level)} ${text}`, "");
  const p = (text: string) => out.push(text, "");
  const list = (items: string[]) => out.push(...items.map((i) => `- ${i}`), "");

  h(1, `${r.season.label} recurring-failure audit · ${r.property.name}`);
  p(`Season ${r.season.from} to ${r.season.to} · generated ${r.generatedAt.slice(0, 10)} · ${r.version}`);
  p(
    `${fmtInt(r.volume.signalsTotal)} records read (${r.volume.bySource.map((s) => `${fmtInt(s.count)} ${SOURCE[s.source] ?? s.source}`).join(", ")}), ` +
      `${fmtInt(r.volume.issues)} issues found, ${fmtInt(r.volume.issuesRecurring)} of them recurring. ` +
      `No person is named in this report: no technician, no agent, no guest.`,
  );

  if (r.narrative) {
    h(2, "Summary");
    p(r.narrative.summary);
    list(r.narrative.highlights);
    p(`_Written by ${r.narrative.model} from the figures below (${r.narrative.promptVersion}); every number in it appears in a table in this report._`);
  }

  h(2, "Baseline");
  p("The numbers the next season is measured against.");
  table(
    out,
    ["Measure", "Value", "Basis"],
    [
      ["Repeat complaints per 1,000 occupied room-nights", fmtNum(r.baseline.repeatsPerThousandRoomNights, 2), `${fmtInt(r.baseline.repeats)} repeats over ${fmtInt(r.baseline.roomNights)} occupied room-nights`],
      ["Closed tickets that held for 30 days", fmtPct(r.baseline.held30Share), `${fmtInt(r.baseline.held30)} of ${fmtInt(r.baseline.closures)} closures`],
      ["Issues reopened after a closure", fmtPct(r.baseline.reopenRate), `${fmtInt(r.baseline.issuesReopened)} of ${fmtInt(r.baseline.issuesWithClosure)} issues with a closure`],
      ["Median time from ticket to closure", fmtHours(r.baseline.medianHoursToResolve), `${fmtInt(r.timeToResolve.firstHalf.tickets + r.timeToResolve.secondHalf.tickets)} closed tickets`],
    ],
  );

  h(2, "1. Recurring failures by room, building and equipment");
  p(
    `${fmtInt(r.volume.issuesRecurring)} issues came back at the same place during the season (two or more episodes a week apart, or a reopen after a closure). ` +
      `Shared-plant problems are shown once, at the cause, with the rooms they reached.`,
  );
  table(
    out,
    ["Kind of place", "Issues", "Recurring"],
    r.volume.byLocationKind.map((k) => [k.kind, fmtInt(k.issues), fmtInt(k.recurring)]),
  );
  table(
    out,
    ["Issue", "Where", "Episodes", "Reopens", "Closures", "Rooms", "Guest reports", "First → last"],
    r.recurring.map((f) => [f.title, where(f), fmtInt(f.episodes), fmtInt(f.reopens), fmtInt(f.closures), fmtInt(f.roomsAffected), guest(f), period(f, r.property.timezone)]),
  );

  h(2, "2. Fixes that did not hold");
  p(
    `Of ${fmtInt(r.fixesHeld.total.closures)} tickets closed in the season, the same problem was reported again at the same place within ` +
      `7 days for ${fmtInt(r.fixesHeld.total.back7)} (${fmtPct(share(r.fixesHeld.total.back7, r.fixesHeld.total.closures))}), ` +
      `within 30 days for ${fmtInt(r.fixesHeld.total.back30)} (${fmtPct(share(r.fixesHeld.total.back30, r.fixesHeld.total.closures))}) and ` +
      `within 90 days for ${fmtInt(r.fixesHeld.total.back90)} (${fmtPct(share(r.fixesHeld.total.back90, r.fixesHeld.total.closures))}). By category and by month; not by technician.`,
  );
  table(
    out,
    ["Category", "Closures", "Back in 7 d", "Back in 30 d", "Back in 90 d"],
    r.fixesHeld.byCategory.map((c) => [label(c.category), fmtInt(c.closures), pctCell(c.back7, c.closures), pctCell(c.back30, c.closures), pctCell(c.back90, c.closures)]),
  );
  table(
    out,
    ["Month", "Closures", "Back in 7 d", "Back in 30 d", "Back in 90 d"],
    r.fixesHeld.byMonth.map((m) => [m.month, fmtInt(m.closures), pctCell(m.back7, m.closures), pctCell(m.back30, m.closures), pctCell(m.back90, m.closures)]),
  );

  h(2, "3. Time to resolve");
  p(
    `Median ${fmtHours(r.timeToResolve.firstHalf.medianHours)} in the first half of the season (${fmtInt(r.timeToResolve.firstHalf.tickets)} tickets) against ` +
      `${fmtHours(r.timeToResolve.secondHalf.medianHours)} in the second half (${fmtInt(r.timeToResolve.secondHalf.tickets)} tickets).`,
  );
  table(
    out,
    ["Category", "Closed tickets", "Median", "90th percentile"],
    r.timeToResolve.byCategory.map((c) => [label(c.category), fmtInt(c.tickets), fmtHours(c.medianHours), fmtHours(c.p90Hours)]),
  );
  table(
    out,
    ["Month", "Closed tickets", "Median", "90th percentile"],
    r.timeToResolve.byMonth.map((m) => [m.month, fmtInt(m.tickets), fmtHours(m.medianHours), fmtHours(m.p90Hours)]),
  );

  h(2, "4. Reviews and surveys tied to operational causes");
  table(
    out,
    ["Source", "Records naming a problem", "Linked to an issue", "… that had a ticket"],
    r.guestVoice.bySource.map((s) => [SOURCE[s.source] ?? s.source, fmtInt(s.withTopic), pctCell(s.linked, s.withTopic), pctCell(s.withTicket, s.withTopic)]),
  );
  p("What guests write about most in surveys and reviews, and how often a ticket exists for it:");
  table(
    out,
    ["Topic", "Category", "Mentions", "With a ticket", "Average score /10"],
    r.guestVoice.byTopic.map((t) => [label(t.topic), label(t.category), fmtInt(t.mentions), pctCell(t.withTicket, t.mentions), fmtNum(t.avgScore, 1)]),
  );
  if (r.guestVoice.silent.length) {
    p("Problems guests write about that rarely became a ticket:");
    for (const s of r.guestVoice.silent) {
      out.push(`- **${label(s.topic)}** (${label(s.category)}): ${fmtInt(s.mentions)} mentions, ${fmtInt(s.withTicket)} with a ticket.`);
      for (const e of s.examples) out.push(`  - ${e.date}, ${SOURCE[e.source] ?? e.source}: “${e.text}”`);
    }
    out.push("");
  }
  const sv = r.guestVoice.surveys;
  p(
    `Guests whose stay was linked to a logged issue scored ${fmtNum(sv.withLinkedIssue.avgOverall, 1)} overall (NPS ${fmtNum(sv.withLinkedIssue.avgNps, 1)}, ` +
      `${fmtPct(sv.withLinkedIssue.recommendShare)} would recommend; ${fmtInt(sv.withLinkedIssue.responses)} responses) against ` +
      `${fmtNum(sv.others.avgOverall, 1)} (NPS ${fmtNum(sv.others.avgNps, 1)}, ${fmtPct(sv.others.recommendShare)}; ${fmtInt(sv.others.responses)} responses) for everyone else.`,
  );

  h(2, "5. Winter-works list");
  p("Ranked by recurrence × (1 + guest reports) × (1 + repeat tickets). Each line is written to be pasted into a budget request.");
  table(
    out,
    ["#", "Issue", "Where", "Priority", "Evidence"],
    r.winterWorks.map((w) => [String(w.rank), w.title, where(w), fmtInt(Math.round(w.priority)), w.evidence]),
  );

  h(2, "6. Records assessment");
  table(
    out,
    ["Measure", "Value", "Verdict", "Note"],
    r.records.metrics.map((m) => [m.label, m.share === null ? fmtInt(m.count) : `${fmtPct(m.share)} (${fmtInt(m.count)} of ${fmtInt(m.total)})`, m.verdict, m.note]),
  );
  p("Five changes to logging practice for next season:");
  out.push(...r.records.recommendations.map((t, i) => `${i + 1}. ${t}`), "");

  h(2, "Volume");
  table(out, ["Source", "Records"], r.volume.bySource.map((s) => [SOURCE[s.source] ?? s.source, fmtInt(s.count)]));
  table(out, ["Language", "Records with text"], r.volume.byLanguage.map((l) => [LANGUAGE[l.language] ?? l.language, fmtInt(l.count)]));
  p(`${fmtInt(r.volume.roomNights)} occupied room-nights in the season.`);

  return out.join("\n");
}

/** The winter-works list as a spreadsheet: semicolon-separated with a BOM, as Greek-locale Excel expects. */
export function renderWinterWorksCsv(r: AuditReport): string {
  const header = ["rank", "priority", "issue", "topic", "category", "location", "kind", "episodes", "reopens", "closures", "repeat_tickets", "rooms_affected", "guest_reports", "first", "last", "evidence"];
  const rows = r.winterWorks.map((w) => [
    w.rank,
    Math.round(w.priority),
    w.title,
    w.topic ?? "",
    w.category ?? "",
    w.locationCode ?? "",
    w.locationKind ?? "",
    w.episodes,
    w.reopens,
    w.closures,
    w.repeatTickets,
    w.roomsAffected,
    w.guestReports,
    w.firstAt.slice(0, 10),
    w.lastAt.slice(0, 10),
    w.evidence,
  ]);
  const cell = (v: string | number) => {
    const s = String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [header, ...rows].map((row) => row.map(cell).join(";")).join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------------------

/** Source names as the console shows them (one dictionary for screens and the memo). */
export const SOURCE: Record<string, string> = Object.fromEntries(["work_order", "front_desk", "survey", "review", "staff_report", "guest_qr", "pms", "compensation"].map((k) => [k, dictLabel("source", k)]));

export const LANGUAGE: Record<string, string> = {
  en: "English",
  el: "Greek",
  "el-latn": "Greeklish",
  de: "German",
  fr: "French",
  it: "Italian",
  ru: "Russian",
  he: "Hebrew",
  unknown: "undetected",
};

/** A topic in words, or the category as the console names it. */
export function label(s: string | null): string {
  if (!s) return categoryLabel(null);
  return (CATEGORIES as readonly string[]).includes(s) ? categoryLabel(s) : s.replace(/_/g, " ");
}

export function where(f: RecurringFailure): string {
  if (!f.locationCode) return "–";
  return f.locationKind && f.locationKind !== "room" ? `${f.locationCode} (${f.locationKind})` : f.locationCode;
}

export function guest(f: RecurringFailure): string {
  return `${f.guestReports} (${f.deskComplaints} desk · ${f.surveyMentions} survey · ${f.reviewMentions} review)`;
}

export function period(f: RecurringFailure, tz: string): string {
  const d = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "2-digit", month: "short" }).format(new Date(iso));
  return `${d(f.firstAt)} → ${d(f.lastAt)}`;
}

export function share(a: number, b: number): number | null {
  return b ? a / b : null;
}

export function pctCell(a: number, b: number): string {
  return b ? `${fmtInt(a)} (${fmtPct(a / b)})` : "–";
}

export function fmtInt(n: number): string {
  return n.toLocaleString("en-GB");
}

export function fmtNum(n: number | null, digits: number): string {
  return n === null ? "–" : n.toFixed(digits);
}

export function fmtPct(r: number | null): string {
  return r === null ? "–" : `${Math.round(100 * r)}%`;
}

export function fmtHours(h: number | null): string {
  if (h === null) return "–";
  if (h < 48) return `${Math.round(h)} h`;
  return `${(h / 24).toFixed(1)} d`;
}

function table(out: string[], headers: string[], rows: string[][]) {
  if (!rows.length) {
    out.push("_nothing in this period_", "");
    return;
  }
  const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
  out.push(`| ${headers.map(esc).join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`);
  for (const row of rows) out.push(`| ${row.map(esc).join(" | ")} |`);
  out.push("");
}
