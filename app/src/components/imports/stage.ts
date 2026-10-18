import type { BatchRow } from "@/console/imports";

/** Status words and their colours (always paired with the word). */
export const STAGE_VARIANT = { uploaded: "default", checked: "info", loading: "info", loaded: "success", failed: "critical", discarded: "secondary" } as const;
export const JOB_VARIANT = { queued: "default", running: "info", succeeded: "success", failed: "critical", cancelled: "secondary" } as const;
export const VERDICT_VARIANT = { go: "success", reshape: "warning", stop: "critical" } as const;

export function stageVariant(status: string) {
  return STAGE_VARIANT[status as keyof typeof STAGE_VARIANT] ?? "default";
}
export function verdictVariant(verdict: string) {
  return VERDICT_VARIANT[verdict as keyof typeof VERDICT_VARIANT] ?? "default";
}

/** Rows inserted across every source, or null before a load. */
export function recordsAdded(b: BatchRow): number | null {
  if (!b.counts) return null;
  return Object.values(b.counts.sources).reduce((n, s) => n + s.inserted, 0);
}

/** Rows already known whose canonical record changed (a ticket closed, a status moved). */
export function recordsUpdated(b: BatchRow): number {
  if (!b.counts) return 0;
  return Object.values(b.counts.sources).reduce((n, s) => n + (s.updated ?? 0), 0);
}
