/** Small, dependency-free formatters for the console. Labels live in the i18n dictionary. */

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

/** Badge variant per issue status (DESIGN.md: reopened = critical, resolved-unverified = warning, verified = success, assigned = info). */
export const STATUS_VARIANT: Record<string, "default" | "critical" | "warning" | "success" | "info" | "secondary"> = {
  detected: "default",
  assigned: "info",
  resolved: "warning",
  reopened: "critical",
  verified: "success",
  closed_unverified: "secondary",
};
