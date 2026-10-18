import { createHash } from "node:crypto";

/**
 * An external id for a record whose export carries none. Built from the
 * fields that make the record what it is (when it happened, where, what
 * it says), not from the whole row: a re-export with a renamed or
 * reordered column, or a corrected typo elsewhere in the row, must find
 * the same record again. Two genuinely identical rows (two €50 gestures
 * for the same room, day and reason) still collapse; the reality check
 * warns when that happens.
 */
export function stableKey(parts: (string | undefined | null)[], fallback: Record<string, unknown>): string {
  const clean = parts.map((p) => (p ?? "").trim().toLowerCase().replace(/\s+/g, " ")).filter(Boolean);
  const basis = clean.length ? clean.join("\u001f") : JSON.stringify(Object.entries(fallback).sort(([a], [b]) => a.localeCompare(b)));
  return "k_" + createHash("sha1").update(basis).digest("hex").slice(0, 16);
}
