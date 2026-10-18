import { label } from "@/i18n";

/** Small, dependency-free formatters for the console. Labels live in the i18n dictionary. */

/** "12 Jul" within the current year, "12 Jul 2025" otherwise. */
export function fmtDate(d: Date, timeZone: string, now: Date = new Date()): string {
  const sameYear = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric" }).format(d) === new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric" }).format(now);
  return new Intl.DateTimeFormat("en-GB", { timeZone, day: "2-digit", month: "short", ...(sameYear ? {} : { year: "numeric" }) }).format(d);
}

/** "1 Apr 2026" from "2026-04-01" (a calendar date, no zone). */
export function fmtIsoDate(iso: string | null | undefined): string {
  if (!iso) return "–";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }).format(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])));
}

/** "Apr 2026" from "2026-04". */
export function fmtMonth(yyyymm: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(yyyymm);
  if (!m) return yyyymm;
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "short", year: "numeric" }).format(new Date(Date.UTC(+m[1], +m[2] - 1, 1)));
}

/** "1 Apr 2026 – 31 Oct 2026". */
export function fmtPeriod(from: string, to: string): string {
  return `${fmtIsoDate(from)} – ${fmtIsoDate(to)}`;
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

/** The category as the dictionary names it ("Air conditioning"), "Unclassified" for none. */
export function categoryLabel(category: string | null | undefined): string {
  return label("category", category || "unclassified");
}

/** The topic in words ("no hot water"), else the category's name. */
export function topicLabel(topic: string | null, category: string | null): string {
  return topic ? topic.replace(/_/g, " ") : categoryLabel(category);
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

/** "1.2 MB", "340 kB", "12 B". */
export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} kB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** A record in another language whose English text has not been produced yet (rules-only normalisation). */
export function needsTranslation(textEn: string | null | undefined, language: string | null | undefined): boolean {
  return !textEn && !!language && language !== "en";
}
