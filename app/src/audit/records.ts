import type { AuditReport, Verdict } from "./types";

/**
 * The records assessment (deliverable 7): what the hotel's tools capture
 * well, what they do not, and the five changes to logging practice that
 * would make next season's data more useful. Pure function over counts, so
 * the thresholds are in one place and can be argued about.
 */
export type RecordsRow = {
  wo: number;
  wo_closed: number;
  wo_note_trivial: number;
  wo_other: number;
  wo_located: number;
  wo_status_values: number;
  wo_status_mismatch: number;
  fd: number;
  fd_located: number;
  fd_note: number;
  fd_defects: number;
  fd_ticketed: number;
  sv: number;
  sv_comment: number;
  sv_stay: number;
  rv: number;
  rv_located: number;
  texts: number;
  texts_non_en: number;
};

type Rule = {
  key: string;
  label: string;
  count: (r: RecordsRow) => number;
  total: (r: RecordsRow) => number | null;
  /** "high" when a high share is good, "low" when a low share is good, "count" when the count itself is judged. */
  direction: "high" | "low" | "count" | "info";
  good: number;
  weak: number;
  note: string;
  recommendation: string | null;
};

const RULES: Rule[] = [
  {
    key: "closure_notes",
    label: "Closed tickets with a real closure note",
    count: (r) => r.wo_closed - r.wo_note_trivial,
    total: (r) => r.wo_closed,
    direction: "high",
    good: 0.9,
    weak: 0.75,
    note: "Empty, or just 'done' / 'ok' / 'έγινε'. The note is what tells the next technician whether the last visit was a repair or a reset.",
    recommendation: "Require a closure note that says what was found and what was done or replaced; 'done' is not a note.",
  },
  {
    key: "ticket_location",
    label: "Tickets with a location we could resolve to a room, facility or equipment",
    count: (r) => r.wo_located,
    total: (r) => r.wo,
    direction: "high",
    good: 0.95,
    weak: 0.85,
    note: "Free-text locations ('312 - bath', 'Δωμ. 312', 'Bldg C boiler room') were matched by rule; the rest cannot be linked.",
    recommendation: "Make the ticket location a pick from the room and asset list instead of free text; the list already exists.",
  },
  {
    key: "category_other",
    label: "Tickets filed under 'Other'",
    count: (r) => r.wo_other,
    total: (r) => r.wo,
    direction: "low",
    good: 0.05,
    weak: 0.12,
    note: "Every 'Other' ticket had to be classified from its text.",
    recommendation: "Cut the category list to the ones this report uses and make 'Other' ask for a word of explanation.",
  },
  {
    key: "status_vocabulary",
    label: "Distinct status spellings in the ticket export",
    count: (r) => r.wo_status_values,
    total: () => null,
    direction: "count",
    good: 5,
    weak: 8,
    note: "'Closed', 'closed', 'Completed', 'Done', 'On hold - parts', 'Waiting parts' … all mean one of five things.",
    recommendation: "Lock the ticket status to five values: new, assigned, in progress, waiting parts, closed.",
  },
  {
    key: "closed_without_time",
    label: "Tickets marked closed without a closure time",
    count: (r) => r.wo_status_mismatch,
    total: (r) => r.wo,
    direction: "low",
    good: 0.02,
    weak: 0.08,
    note: "Without a closure time the ticket cannot count towards time-to-resolve or towards 'held for 30 days'.",
    recommendation: "Closing a ticket must stamp the closure time; the held-for-30-days figure depends on it.",
  },
  {
    key: "desk_location",
    label: "Desk complaints with a room or place",
    count: (r) => r.fd_located,
    total: (r) => r.fd,
    direction: "high",
    good: 0.95,
    weak: 0.85,
    note: "Facility complaints often leave the room empty; the place still matters.",
    recommendation: "Log the room or the facility on every desk complaint, including the ones about the pool, the bar or the lift.",
  },
  {
    key: "desk_to_ticket",
    label: "Desk complaints about a defect that reached a ticket",
    count: (r) => r.fd_ticketed,
    total: (r) => r.fd_defects,
    direction: "high",
    good: 0.7,
    weak: 0.4,
    note: "The rest were handled by phone or radio and left no trace in maintenance.",
    recommendation: "Every defect reported at the desk raises a ticket carrying the complaint number, so the complaint and the fix meet.",
  },
  {
    key: "desk_note",
    label: "Desk complaints with an agent note",
    count: (r) => r.fd_note,
    total: (r) => r.fd,
    direction: "high",
    good: 0.8,
    weak: 0.5,
    note: "The guest's own words are kept; the agent note says what was done.",
    recommendation: "Ask agents for a one-line note on what was done about each complaint.",
  },
  {
    key: "survey_stay",
    label: "Survey comments that reach a stay (reservation number present)",
    count: (r) => r.sv_stay,
    total: (r) => r.sv_comment,
    direction: "high",
    good: 0.95,
    weak: 0.8,
    note: "The reservation number is what ties a comment to a room without any guest identity.",
    recommendation: "Keep the reservation number on the survey export; it ties a comment to a room without any guest identity.",
  },
  {
    key: "survey_comments",
    label: "Surveys with a comment",
    count: (r) => r.sv_comment,
    total: (r) => r.sv,
    direction: "info",
    good: 0,
    weak: 0,
    note: "Comments are where the complaints hide; scores alone rarely say what was wrong.",
    recommendation: null,
  },
  {
    key: "review_place",
    label: "Reviews that name a wing, room type or place",
    count: (r) => r.rv_located,
    total: (r) => r.rv,
    direction: "info",
    good: 0,
    weak: 0,
    note: "Reviews rarely say where; they attach to issues by topic and time instead.",
    recommendation: null,
  },
  {
    key: "non_english",
    label: "Records written in a language other than English",
    count: (r) => r.texts_non_en,
    total: (r) => r.texts,
    direction: "info",
    good: 0,
    weak: 0,
    note: "Greek, Greeklish, German, French, Italian, Russian, Hebrew. All were read; none needs to change.",
    recommendation: null,
  },
];

const STANDING: string[] = [
  "Flag a new ticket raised at a location that had a closure in the last 30 days as 'came back', so repeats are visible when they happen rather than in the winter.",
  "Export tickets, the desk log, surveys and occupancy once a month in the same format, so the baseline in this report can be tracked through the season.",
  "Record which plant serves which rooms (boilers, chillers, pump stations) in the asset list; most shared-cause failures in this report were found through that map.",
];

export function assessRecords(r: RecordsRow): AuditReport["records"] {
  const metrics = RULES.map((rule) => {
    const count = rule.count(r);
    const total = rule.total(r);
    const share = total ? count / total : null;
    return { key: rule.key, label: rule.label, count, total: total ?? 0, share: share === null ? null : Math.round(share * 1000) / 1000, verdict: verdict(rule, count, share), note: rule.note };
  });
  const order: Verdict[] = ["poor", "weak"];
  const recommendations: string[] = [];
  for (const v of order) {
    for (const m of metrics) {
      if (m.verdict !== v) continue;
      const rule = RULES.find((x) => x.key === m.key);
      if (rule?.recommendation) recommendations.push(rule.recommendation);
    }
  }
  for (const s of STANDING) if (recommendations.length < 5) recommendations.push(s);
  return { metrics, recommendations: recommendations.slice(0, 5) };
}

function verdict(rule: Rule, count: number, share: number | null): Verdict {
  switch (rule.direction) {
    case "info":
      return "info";
    case "count":
      return count <= rule.good ? "good" : count <= rule.weak ? "weak" : "poor";
    case "high":
      if (share === null) return "info";
      return share >= rule.good ? "good" : share >= rule.weak ? "weak" : "poor";
    case "low":
      if (share === null) return "info";
      return share <= rule.good ? "good" : share <= rule.weak ? "weak" : "poor";
  }
}
