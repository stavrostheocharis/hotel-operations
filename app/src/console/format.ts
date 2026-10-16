/** Small, dependency-free formatters for the console. */

export function fmtDate(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, day: "2-digit", month: "short" }).format(d);
}

export function fmtDateTime(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);
}

export function fmtHours(h: number | null): string {
  if (h === null || Number.isNaN(h)) return "–";
  if (h < 48) return `${Math.round(h)} h`;
  return `${(h / 24).toFixed(1)} d`;
}

export function fmtRate(r: number | null, digits = 0): string {
  return r === null ? "–" : `${(100 * r).toFixed(digits)}%`;
}

export function fmtNumber(n: number | null, digits = 1): string {
  return n === null ? "–" : n.toFixed(digits);
}

export function topicLabel(topic: string | null, category: string | null): string {
  const t = topic ?? category;
  return t ? t.replace(/_/g, " ") : "unclassified";
}

export const STATUS: Record<string, { label: string; variant: "default" | "critical" | "warning" | "success" | "info" | "secondary" }> = {
  detected: { label: "Open", variant: "default" },
  assigned: { label: "Assigned", variant: "info" },
  resolved: { label: "Resolved, unverified", variant: "warning" },
  reopened: { label: "Reopened", variant: "critical" },
  verified: { label: "Verified", variant: "success" },
  closed_unverified: { label: "Closed, no recurrence", variant: "secondary" },
};

export const SOURCE: Record<string, string> = {
  work_order: "Ticket",
  front_desk: "Front desk",
  survey: "Survey",
  review: "Review",
  staff_report: "Staff",
  guest_qr: "Guest QR",
  pms: "PMS",
  compensation: "Compensation",
};

export const METHOD: Record<string, string> = {
  rule: "rule",
  embedding: "similarity",
  llm: "model",
  human: "confirmed",
};
