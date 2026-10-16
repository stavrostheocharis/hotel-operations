import type { LocationIndex } from "@/normalize/location-rules";
import { TOPICS } from "@/normalize/taxonomy";
import { BUILDING_SCOPED_TOPICS, daysBetween } from "./rules";
import { LIVE_SOURCES, type CandidatePair, type LinkSignal } from "./types";

/**
 * From a cluster of linked signals to an issue: what it is, where the cause
 * sits, whether it came back, whether the last fix held.
 */

export type IssueStatus = "detected" | "assigned" | "resolved" | "verified" | "reopened" | "closed_unverified";

export type IssueDraft = {
  signalIds: string[];
  primaryId: string;
  duplicateIds: Set<string>;
  title: string;
  topic: string | null;
  category: string | null;
  severity: "low" | "medium" | "high" | "critical";
  locationCode: string | null;
  openedAt: Date;
  resolvedAt: Date | null;
  status: IssueStatus;
  reopenCount: number;
  recurred: boolean;
  fixHeld: boolean | null;
  rootCause: string;
  recurrenceWindowDays: number;
  episodes: number;
  closures: { signalId: string; closedAt: Date }[];
  reopenEvidence: { closedAt: Date; signalId: string; at: Date }[];
};

const SEVERITY: Record<string, IssueDraft["severity"]> = {
  no_hot_water: "high", ac_not_cooling: "high", ceiling_leak: "high", elevator_stuck: "high",
  railing_loose: "high", keycard_fails: "medium", sewage_smell: "medium", low_pressure: "medium",
  mosquitoes: "medium", wifi_weak: "medium", jacuzzi_broken: "medium", pool_cold: "medium",
  breakfast_slow: "medium", room_not_cleaned: "medium", hammam_cold: "medium", food_cold: "medium",
};

const RECURRENCE_WINDOW: Record<string, number> = { plumbing: 90, hvac: 60, housekeeping: 7, fnb_service: 14, facilities: 30 };

export function buildIssue(
  cluster: LinkSignal[],
  pairs: CandidatePair[],
  index: LocationIndex,
  asOf: Date,
): IssueDraft {
  const sorted = [...cluster].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const topic = majority(sorted.map((s) => s.topic));
  const category = majority(sorted.map((s) => s.category)) ?? (topic ? TOPICS[topic]?.category ?? null : null);
  const windowDays = RECURRENCE_WINDOW[category ?? ""] ?? 30;

  // Where the cause sits.
  const rootCode = rootCauseLocation(sorted, pairs, topic, index);

  // Work-order closures, in time order.
  const closures = sorted
    .filter((s) => s.source === "work_order" && s.wo?.closedAt)
    .map((s) => ({ signalId: s.id, closedAt: s.wo!.closedAt! }))
    .sort((a, b) => a.closedAt.getTime() - b.closedAt.getTime());

  // Evidence that it happened again after a closure: a live record more than
  // two days later, or a survey whose stay began after the closure. Public
  // reviews arrive weeks after the stay and are not counted.
  const reopenEvidence: IssueDraft["reopenEvidence"] = [];
  for (const c of closures) {
    const later = sorted.find((s) => {
      if (s.source === "survey") return s.stayCheckIn ? s.stayCheckIn.getTime() > c.closedAt.getTime() + DAY : false;
      if (!LIVE_SOURCES.includes(s.source)) return false;
      const at = s.source === "work_order" ? s.wo?.createdAt ?? s.occurredAt : s.occurredAt;
      return at.getTime() > c.closedAt.getTime() + 2 * DAY;
    });
    if (later) {
      const at = later.source === "survey" ? later.stayCheckIn! : later.source === "work_order" ? later.wo?.createdAt ?? later.occurredAt : later.occurredAt;
      reopenEvidence.push({ closedAt: c.closedAt, signalId: later.id, at });
    }
  }
  const lastClosure = closures.length ? closures[closures.length - 1] : null;
  const evidenceAfterLast = lastClosure ? reopenEvidence.find((e) => e.closedAt.getTime() === lastClosure.closedAt.getTime()) : undefined;

  // Episodes: runs of live/survey signals separated by more than seven days.
  const episodeSignals = sorted.filter((s) => s.source !== "review");
  let episodes = episodeSignals.length ? 1 : 0;
  for (let i = 1; i < episodeSignals.length; i++) {
    if (daysBetween(episodeSignals[i - 1].occurredAt, episodeSignals[i].occurredAt) > 7) episodes++;
  }

  const reopenCount = reopenEvidence.length;
  const recurred = reopenCount >= 1 || episodes >= 2;
  const fixHeld = lastClosure ? !evidenceAfterLast : null;

  let status: IssueStatus;
  let resolvedAt: Date | null = null;
  if (!lastClosure) status = "detected";
  else if (evidenceAfterLast) status = "reopened";
  else {
    resolvedAt = lastClosure.closedAt;
    status = daysBetween(lastClosure.closedAt, asOf) >= windowDays ? "closed_unverified" : "resolved";
  }

  const duplicateIds = findDuplicates(sorted);
  const title = `${topicLabel(topic, category)} · ${rootCode ?? "unknown location"}`;
  const rootCause = `${describeRootCause(rootCode, sorted, topic, index)}; ${episodes} episode${episodes === 1 ? "" : "s"}, ${closures.length} closure${closures.length === 1 ? "" : "s"}, ${reopenCount} reopen${reopenCount === 1 ? "" : "s"}`;

  return {
    signalIds: sorted.map((s) => s.id),
    primaryId: sorted[0].id,
    duplicateIds,
    title,
    topic,
    category,
    severity: (topic ? SEVERITY[topic] : undefined) ?? "medium",
    locationCode: rootCode,
    openedAt: sorted[0].occurredAt,
    resolvedAt,
    status,
    reopenCount,
    recurred,
    fixHeld,
    rootCause,
    recurrenceWindowDays: windowDays,
    episodes,
    closures,
    reopenEvidence,
  };
}

const DAY = 86_400_000;

function rootCauseLocation(sorted: LinkSignal[], pairs: CandidatePair[], topic: string | null, index: LocationIndex): string | null {
  const equipment = sorted.filter((s) => s.locationKind === "equipment").map((s) => s.locationCode!);
  if (equipment.length) return majority(equipment);
  const rooms = [...new Set(sorted.filter((s) => s.locationKind === "room").map((s) => s.locationCode!))];
  const clustered = pairs.some((p) => p.rule.startsWith("building-cluster"));
  if (clustered && rooms.length >= 2) {
    const building = majority(sorted.map((s) => s.building));
    if (building && topic) {
      for (const suffix of BUILDING_SCOPED_TOPICS[topic] ?? []) {
        const code = `${building}-${suffix}`;
        if (index.has(code)) return code;
      }
      const floors = [...new Set(rooms.map((r) => `${building}/${r[0]}`))];
      if (floors.length === 1 && index.floors.has(floors[0])) return floors[0];
      return building;
    }
  }
  if (rooms.length === 1) return rooms[0];
  const facility = sorted.filter((s) => s.locationKind === "facility").map((s) => s.locationCode!);
  if (facility.length) return majority(facility);
  if (rooms.length > 1) {
    const building = majority(sorted.map((s) => s.building));
    return building ?? rooms[0];
  }
  const any = sorted.find((s) => s.locationCode);
  return any?.locationCode ?? null;
}

function describeRootCause(code: string | null, sorted: LinkSignal[], topic: string | null, index: LocationIndex): string {
  const rooms = [...new Set(sorted.filter((s) => s.locationKind === "room").map((s) => s.locationCode!))];
  const kind = code ? index.byCode.get(code.toUpperCase())?.kind : null;
  const what = topicLabel(topic, null);
  if (kind === "equipment") return `${what} traced to shared equipment ${code}; ${rooms.length} room(s) affected`;
  if (kind === "building" || kind === "floor") return `${what} across ${rooms.length} rooms in ${code}; shared cause suspected, no equipment ticket linked`;
  if (kind === "facility") return `${what} at ${code}`;
  return `${what} in ${code ?? "an unknown location"}`;
}

/** Two tickets at the same place for the same topic within two days: the second is a duplicate log. */
function findDuplicates(sorted: LinkSignal[]): Set<string> {
  const dup = new Set<string>();
  const wos = sorted.filter((s) => s.source === "work_order");
  for (let i = 1; i < wos.length; i++) {
    const prev = wos[i - 1];
    const cur = wos[i];
    if (prev.locationCode && prev.locationCode === cur.locationCode && prev.topic === cur.topic && daysBetween(prev.occurredAt, cur.occurredAt) <= 2) {
      dup.add(cur.id);
    }
  }
  return dup;
}

export function topicLabel(topic: string | null, category: string | null): string {
  if (topic) return topic.replace(/_/g, " ");
  if (category) return category.replace(/_/g, " ");
  return "unclassified";
}

function majority<T>(values: (T | null | undefined)[]): T | null {
  const counts = new Map<T, number>();
  for (const v of values) if (v !== null && v !== undefined) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | null = null;
  let n = 0;
  for (const [v, c] of counts) if (c > n) {
    best = v;
    n = c;
  }
  return best;
}
