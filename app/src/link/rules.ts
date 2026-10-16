import type { LocationIndex } from "@/normalize/location-rules";
import { TOPICS } from "@/normalize/taxonomy";
import type { CandidatePair, LinkSignal } from "./types";

/**
 * Candidate generation and deterministic scoring. Every pair the linker will
 * ever consider comes from one of these rules, with the rule name and the
 * numbers behind it kept as evidence. Scores: >= ACCEPT links outright,
 * between GRAY_LOW and ACCEPT the pair goes to embeddings and the model,
 * below GRAY_LOW it is dropped.
 */

export const ACCEPT = 0.6;
export const GRAY_LOW = 0.4;

const DAY = 86_400_000;

/** Topics whose cause is usually shared plant for a whole building, with the equipment suffix to look for. */
export const BUILDING_SCOPED_TOPICS: Record<string, string[]> = {
  no_hot_water: ["BOILER", "PUMP"],
  low_pressure: ["PUMP", "BOILER"],
  ac_not_cooling: ["CHILLER"],
  noise_equipment: ["CHILLER"],
  elevator_stuck: ["LIFT-1", "LIFT-2"],
  keycard_fails: ["LOCKS-CONTROLLER"],
  sewage_smell: [],
  mosquitoes: [],
  wifi_weak: [],
  room_not_cleaned: [],
  towels_missing: [],
  noisy_cleaning: [],
};

/** Topics that come back over a season rather than within a week. */
const LONG_WINDOW_TOPICS = new Set([
  "ac_not_cooling", "ac_noisy", "ac_dripping", "no_hot_water", "low_pressure", "drain_blocked",
  "ceiling_leak", "sewage_smell", "safe_stuck", "tv_broken", "keycard_fails", "balcony_door_lock",
  "mosquitoes", "wifi_weak", "jacuzzi_broken", "minibar_warm", "bed_uncomfortable", "railing_loose",
  "shower_door", "elevator_stuck", "hammam_cold", "spa_changing_smell", "gym_treadmill",
  "breakfast_slow", "food_cold", "bar_warm_drinks", "noise_music", "sunbeds", "pool_cold",
  "pool_cloudy", "restaurant_hot", "room_not_cleaned", "lights_flicker", "toilet_flush",
]);

const WINDOWS = {
  samePlaceStrong: 45,
  samePlaceLong: 120,
  samePlaceLongFacility: 60,
  samePlaceShortTopic: 21,
  sameCategoryAccept: 14,
  sameCategoryGray: 30,
  clusterGap: 7,
  clusterSpan: 14,
  leak: 21,
  serves: 60,
  containment: 45,
  containmentGray: 90,
  reviewAttach: 35,
};

export type ServesMap = Map<string, Set<string>>;

export function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / DAY;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function generateCandidates(signals: LinkSignal[], index: LocationIndex, serves: ServesMap = new Map()): CandidatePair[] {
  const out = new Map<string, CandidatePair>();
  const add = (p: CandidatePair) => {
    const k = pairKey(p.a, p.b);
    const prev = out.get(k);
    if (!prev || p.score > prev.score) out.set(k, p);
  };

  const byLocation = groupBy(signals.filter((s) => s.locationCode), (s) => s.locationCode!);

  // 1. Same place: same room / villa / equipment / facility.
  for (const group of byLocation.values()) {
    const sorted = [...group].sort((x, y) => x.occurredAt.getTime() - y.occurredAt.getTime());
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i];
        const b = sorted[j];
        const gap = daysBetween(a.occurredAt, b.occurredAt);
        if (gap > WINDOWS.samePlaceLong) break;
        const pair = scoreSamePlace(a, b, gap);
        if (pair) add(pair);
      }
    }
  }

  // 2. Equipment and what it serves: the boiler ticket and the cold showers it caused.
  for (const [equipmentCode, served] of serves) {
    const eq = byLocation.get(equipmentCode);
    if (!eq) continue;
    for (const servedCode of served) {
      const others = byLocation.get(servedCode);
      if (!others) continue;
      for (const e of eq) {
        for (const o of others) {
          const gap = daysBetween(e.occurredAt, o.occurredAt);
          if (gap > WINDOWS.serves) continue;
          if (e.topic && o.topic && e.topic === o.topic) {
            add({ a: e.id, b: o.id, score: 0.8, rule: "serves-topic", method: "rule", evidence: { equipment: equipmentCode, serves: servedCode, topic: e.topic, gap_days: round(gap) } });
          } else if (e.category && o.category && e.category === o.category && (!e.topic || !o.topic) && gap <= WINDOWS.sameCategoryGray) {
            const score = gap <= WINDOWS.sameCategoryAccept ? ACCEPT : 0.5;
            add({ a: e.id, b: o.id, score, rule: "serves-category", method: "rule", evidence: { equipment: equipmentCode, serves: servedCode, category: e.category, gap_days: round(gap) } });
          }
        }
      }
    }
  }

  // 2b. Containment: a record at a building, a floor or that building's shared
  //     plant, and a room record in it with the same topic. One cold shower and
  //     a boiler ticket the same week are the same problem.
  const roomsByBuilding = groupBy(signals.filter((s) => s.locationKind === "room" && s.building), (s) => s.building!);
  for (const h of signals) {
    if (!h.topic || !h.building) continue;
    const isHub =
      h.locationKind === "building" ||
      h.locationKind === "floor" ||
      (h.locationKind === "equipment" && (BUILDING_SCOPED_TOPICS[h.topic] ?? []).some((suffix) => h.locationCode === `${h.building}-${suffix}`));
    if (!isHub) continue;
    for (const r of roomsByBuilding.get(h.building) ?? []) {
      if (r.topic !== h.topic) continue;
      if (h.locationKind === "floor" && floorOf(r.locationCode!, index) !== h.locationCode!.split("/")[1]) continue;
      const gap = daysBetween(h.occurredAt, r.occurredAt);
      if (gap > WINDOWS.containmentGray) continue;
      const score = gap <= WINDOWS.containment ? 0.7 : 0.5;
      add({ a: h.id, b: r.id, score, rule: "containment", method: "rule", evidence: { hub: h.locationCode, room: r.locationCode, topic: h.topic, gap_days: round(gap) } });
    }
  }

  // 3. Cross-room leak: the symptom is downstairs, the cause upstairs.
  for (const s of signals) {
    if (s.topic !== "ceiling_leak" || !s.locationCode || s.locationKind !== "room") continue;
    const above = roomAbove(s.locationCode, index);
    if (!above) continue;
    for (const o of byLocation.get(above) ?? []) {
      const gap = daysBetween(s.occurredAt, o.occurredAt);
      if (gap > WINDOWS.leak) continue;
      if (o.category && o.category !== "plumbing" && o.topic !== "ceiling_leak") continue;
      add({ a: s.id, b: o.id, score: 0.75, rule: "cross-room-leak", method: "rule", evidence: { below: s.locationCode, above, gap_days: round(gap) } });
    }
  }

  // 4. Building clusters: several rooms in one building, same shared-plant topic, within days.
  //    Signals at the building, a floor or the matching equipment join as the hub.
  const byBuildingTopic = groupBy(
    signals.filter((s) => s.building && s.topic && s.topic in BUILDING_SCOPED_TOPICS),
    (s) => `${s.building}|${s.topic}`,
  );
  for (const [key, group] of byBuildingTopic) {
    const [building, topic] = key.split("|");
    const rooms = group.filter((s) => s.locationKind === "room").sort((x, y) => x.occurredAt.getTime() - y.occurredAt.getTime());
    const hubs = group.filter(
      (s) =>
        s.locationKind === "building" ||
        s.locationKind === "floor" ||
        (s.locationKind === "equipment" && BUILDING_SCOPED_TOPICS[topic].some((suffix) => s.locationCode === `${building}-${suffix}`)),
    );
    for (const w of clusterWindows(rooms, WINDOWS.clusterGap, WINDOWS.clusterSpan)) {
      const roomCodes = [...new Set(w.map((s) => s.locationCode))];
      if (roomCodes.length < 3) continue;
      const start = w[0].occurredAt;
      const end = w[w.length - 1].occurredAt;
      const evidence = { building, topic, rooms: roomCodes.length, window_days: round(daysBetween(start, end)) };
      for (let i = 0; i < w.length; i++) {
        for (let j = i + 1; j < w.length; j++) add({ a: w[i].id, b: w[j].id, score: 0.8, rule: "building-cluster", method: "rule", evidence });
      }
      for (const h of hubs) {
        if (h.occurredAt.getTime() < start.getTime() - WINDOWS.clusterSpan * DAY || h.occurredAt.getTime() > end.getTime() + WINDOWS.clusterSpan * DAY) continue;
        for (const s of w) add({ a: h.id, b: s.id, score: 0.85, rule: "building-cluster:hub", method: "rule", evidence: { ...evidence, hub: h.locationCode } });
      }
    }
  }

  // 5. Same stay: a survey about the stay and a complaint logged during it.
  const byStay = groupBy(signals.filter((s) => s.stayRef), (s) => s.stayRef!);
  for (const group of byStay.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        if (!a.topic || !b.topic || a.topic !== b.topic) continue;
        add({ a: a.id, b: b.id, score: 0.9, rule: "same-stay", method: "rule", evidence: { topic: a.topic } });
      }
    }
  }

  return [...out.values()];
}

/**
 * Reviews are almost never located. After clustering, attach a review with a
 * topic to the one cluster of that topic it can plausibly belong to: same
 * building as its wing hint (or the topic's facility), and published while
 * the cluster was live or within a few weeks after. Ambiguity means no link.
 */
export function attachOrphanReviews(
  reviews: LinkSignal[],
  clusters: LinkSignal[][],
  buildingHints: Map<string, string | null>,
): CandidatePair[] {
  const out: CandidatePair[] = [];
  const multi = clusters.filter((c) => c.length >= 2);
  for (const r of reviews) {
    if (!r.topic || r.locationCode) continue;
    const hint = buildingHints.get(r.id) ?? null;
    const facility = TOPICS[r.topic]?.defaultLocation ?? null;
    const matches = multi.filter((c) => {
      const topics = c.map((s) => s.topic).filter(Boolean);
      if (!topics.length || topics.filter((t) => t === r.topic).length < topics.length / 2) return false;
      const first = Math.min(...c.map((s) => s.occurredAt.getTime()));
      const last = Math.max(...c.filter((s) => s.source !== "review").map((s) => s.occurredAt.getTime()));
      const t = r.occurredAt.getTime();
      if (t < first - 3 * DAY || t > last + WINDOWS.reviewAttach * DAY) return false;
      if (facility) return c.some((s) => s.locationCode === facility);
      if (!hint) return false;
      return c.some((s) => s.building === hint);
    });
    if (matches.length !== 1) continue;
    const anchor = matches[0][0];
    out.push({ a: r.id, b: anchor.id, score: ACCEPT, rule: "review-attach", method: "rule", evidence: { topic: r.topic, building_hint: hint, facility } });
  }
  return out;
}

function scoreSamePlace(a: LinkSignal, b: LinkSignal, gap: number): CandidatePair | null {
  const base = { a: a.id, b: b.id, method: "rule" as const };
  const place = a.locationCode!;
  if (a.topic && b.topic && a.topic === b.topic) {
    const long = LONG_WINDOW_TOPICS.has(a.topic);
    const strong = gap <= WINDOWS.samePlaceStrong;
    if (!long && gap > WINDOWS.samePlaceShortTopic) return null;
    const longWindow = a.locationKind === "facility" ? WINDOWS.samePlaceLongFacility : WINDOWS.samePlaceLong;
    const score = strong ? 0.9 : gap <= longWindow ? 0.65 : 0;
    if (!score) return null;
    return { ...base, score, rule: strong ? "same-place-topic" : "same-place-topic:long-gap", evidence: { place, topic: a.topic, gap_days: round(gap) } };
  }
  if (gap > WINDOWS.sameCategoryGray) return null;
  if (a.category && b.category && a.category === b.category && (!a.topic || !b.topic)) {
    const score = gap <= WINDOWS.sameCategoryAccept ? ACCEPT : 0.5;
    return { ...base, score, rule: "same-place-category", evidence: { place, category: a.category, gap_days: round(gap) } };
  }
  if ((!a.topic || !b.topic) && (!a.category || !b.category) && (a.text || b.text)) {
    // One side is unclassified: only text similarity or a model can tell.
    return { ...base, score: 0.4, rule: "same-place-unclassified", evidence: { place, gap_days: round(gap) } };
  }
  return null;
}

/** Runs of signals where consecutive gaps stay under `gap` days and the whole run spans at most `span` days. */
function clusterWindows(sorted: LinkSignal[], gap: number, span: number): LinkSignal[][] {
  const windows: LinkSignal[][] = [];
  let current: LinkSignal[] = [];
  for (const s of sorted) {
    if (
      current.length &&
      (daysBetween(current[current.length - 1].occurredAt, s.occurredAt) > gap || daysBetween(current[0].occurredAt, s.occurredAt) > span)
    ) {
      windows.push(current);
      current = [];
    }
    current.push(s);
  }
  if (current.length) windows.push(current);
  return windows;
}

/** "214" → "314" when both exist in the same building. */
export function roomAbove(code: string, index: LocationIndex): string | null {
  const m = /^(\d)(\d{2})$/.exec(code);
  if (!m) return null;
  const above = `${Number(m[1]) + 1}${m[2]}`;
  if (!index.rooms.has(above)) return null;
  const a = index.byCode.get(code)?.attributes?.building;
  const b = index.byCode.get(above)?.attributes?.building;
  return a && a === b ? above : null;
}

function floorOf(roomCode: string, index: LocationIndex): string {
  const f = index.byCode.get(roomCode.toUpperCase())?.attributes?.floor;
  return f === undefined || f === null ? "?" : String(f);
}

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const arr = m.get(k);
    if (arr) arr.push(it);
    else m.set(k, [it]);
  }
  return m;
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
