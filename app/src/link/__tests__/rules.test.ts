import { describe, expect, it } from "vitest";
import { LocationIndex, type LocationRow } from "@/normalize/location-rules";
import { attachOrphanReviews, generateCandidates, roomAbove } from "../rules";
import type { LinkSignal } from "../types";

function row(code: string, kind: LocationRow["kind"], attributes: Record<string, unknown> = {}): LocationRow {
  return { id: `id-${code}`, code, kind, aliases: [], attributes };
}

const index = new LocationIndex([
  row("A", "building"), row("B", "building"), row("C", "building"),
  row("A/1", "floor"), row("A/2", "floor"), row("A/3", "floor"), row("C/1", "floor"), row("C/2", "floor"),
  row("214", "room", { building: "A", floor: 2 }), row("314", "room", { building: "A", floor: 3 }),
  row("312", "room", { building: "A", floor: 3 }), row("161", "room", { building: "C", floor: 1 }),
  row("162", "room", { building: "C", floor: 1 }), row("163", "room", { building: "C", floor: 1 }),
  row("136", "room", { building: "B", floor: 1 }),
  row("C-BOILER", "equipment", { building: "C" }), row("A-CHILLER", "equipment", { building: "A" }),
]);

let n = 0;
type SigInput = Omit<Partial<LinkSignal>, "occurredAt" | "locationCode"> & { locationCode: string | null; occurredAt: string };
function sig(partial: SigInput): LinkSignal {
  n++;
  const code = partial.locationCode;
  const kind = code ? index.byCode.get(code)?.kind ?? null : null;
  const building = code ? (kind === "building" ? code : (index.byCode.get(code)?.attributes?.building as string) ?? null) : null;
  return {
    id: partial.id ?? `s${n}`,
    source: partial.source ?? "front_desk",
    externalId: partial.externalId ?? String(n),
    occurredAt: new Date(partial.occurredAt),
    locationCode: code,
    locationKind: kind,
    building,
    topic: partial.topic ?? null,
    category: partial.category ?? null,
    stayRef: partial.stayRef ?? null,
    text: partial.text ?? "text",
    wo: partial.wo ?? null,
    stayCheckIn: partial.stayCheckIn ?? null,
  };
}

const pairFor = (pairs: ReturnType<typeof generateCandidates>, a: string, b: string) =>
  pairs.find((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a));

describe("generateCandidates", () => {
  it("links the same topic at the same room, strongly within 45 days and weakly up to 120", () => {
    const s = [
      sig({ id: "a", locationCode: "312", occurredAt: "2026-06-14", topic: "ac_not_cooling", category: "hvac" }),
      sig({ id: "b", locationCode: "312", occurredAt: "2026-06-17", topic: "ac_not_cooling", category: "hvac", source: "work_order" }),
      sig({ id: "c", locationCode: "312", occurredAt: "2026-08-20", topic: "ac_not_cooling", category: "hvac" }),
      sig({ id: "d", locationCode: "312", occurredAt: "2026-12-01", topic: "ac_not_cooling", category: "hvac" }),
    ];
    const pairs = generateCandidates(s, index);
    expect(pairFor(pairs, "a", "b")?.score).toBe(0.9);
    expect(pairFor(pairs, "a", "c")?.score).toBe(0.65);
    expect(pairFor(pairs, "a", "d")).toBeUndefined();
  });

  it("does not link the same topic in another building or the room next door", () => {
    const s = [
      sig({ id: "a", locationCode: "161", occurredAt: "2026-06-12", topic: "no_hot_water", category: "plumbing" }),
      sig({ id: "b", locationCode: "136", occurredAt: "2026-06-12", topic: "no_hot_water", category: "plumbing" }),
      sig({ id: "c", locationCode: "162", occurredAt: "2026-06-13", topic: "no_hot_water", category: "plumbing" }),
    ];
    const pairs = generateCandidates(s, index);
    expect(pairFor(pairs, "a", "b")).toBeUndefined();
    expect(pairFor(pairs, "a", "c")).toBeUndefined(); // only two rooms: no cluster
  });

  it("clusters three rooms of one building with a shared-plant topic and pulls in the equipment ticket", () => {
    const s = [
      sig({ id: "a", locationCode: "161", occurredAt: "2026-06-12", topic: "no_hot_water", category: "plumbing" }),
      sig({ id: "b", locationCode: "162", occurredAt: "2026-06-13", topic: "no_hot_water", category: "plumbing" }),
      sig({ id: "c", locationCode: "163", occurredAt: "2026-06-15", topic: "no_hot_water", category: "plumbing" }),
      sig({ id: "e", locationCode: "C-BOILER", occurredAt: "2026-06-14", topic: "no_hot_water", category: "plumbing", source: "work_order" }),
      sig({ id: "x", locationCode: "136", occurredAt: "2026-06-13", topic: "no_hot_water", category: "plumbing" }),
    ];
    const pairs = generateCandidates(s, index);
    expect(pairFor(pairs, "a", "b")?.rule).toBe("building-cluster");
    expect(pairFor(pairs, "b", "c")?.score).toBe(0.8);
    expect(pairFor(pairs, "e", "a")?.rule).toBe("building-cluster:hub");
    expect(pairFor(pairs, "x", "a")).toBeUndefined();
  });

  it("links a lone cold-shower complaint to the boiler ticket of its building, and the boiler to the pool it serves", () => {
    const s = [
      sig({ id: "room", locationCode: "161", occurredAt: "2026-08-03", topic: "no_hot_water", category: "plumbing" }),
      sig({ id: "boiler", locationCode: "C-BOILER", occurredAt: "2026-08-06", topic: "no_hot_water", category: "plumbing", source: "work_order" }),
      sig({ id: "late", locationCode: "162", occurredAt: "2026-10-20", topic: "no_hot_water", category: "plumbing" }),
      sig({ id: "untyped", locationCode: "C-BOILER", occurredAt: "2026-08-07", topic: null, category: "plumbing", source: "work_order" }),
    ];
    const serves = new Map([["C-BOILER", new Set(["C"])]]);
    const pairs = generateCandidates(s, index, serves);
    expect(pairFor(pairs, "room", "boiler")?.rule).toBe("containment");
    expect(pairFor(pairs, "room", "boiler")?.score).toBe(0.7);
    // Ten weeks later is only a gray-zone candidate for the model.
    expect(pairFor(pairs, "late", "boiler")?.score).toBe(0.5);
    // Two tickets at the boiler a day apart, one unclassified: same place, same category.
    expect(pairFor(pairs, "boiler", "untyped")?.rule).toBe("same-place-category");
    expect(pairFor(pairs, "boiler", "untyped")?.score).toBe(0.6);
  });

  it("links a ceiling leak to the room above within three weeks", () => {
    expect(roomAbove("214", index)).toBe("314");
    expect(roomAbove("314", index)).toBeNull();
    const s = [
      sig({ id: "below", locationCode: "214", occurredAt: "2026-07-01", topic: "ceiling_leak", category: "plumbing" }),
      sig({ id: "above", locationCode: "314", occurredAt: "2026-07-03", topic: "toilet_flush", category: "plumbing", source: "work_order" }),
      sig({ id: "other", locationCode: "314", occurredAt: "2026-07-03", topic: "tv_broken", category: "it_tv", source: "work_order" }),
    ];
    const pairs = generateCandidates(s, index);
    expect(pairFor(pairs, "below", "above")?.rule).toBe("cross-room-leak");
    expect(pairFor(pairs, "below", "other")).toBeUndefined();
  });

  it("links a survey to the complaint of the same stay and leaves unclassified pairs in the gray zone", () => {
    const s = [
      sig({ id: "fd", locationCode: "312", occurredAt: "2026-07-02", topic: "wifi_weak", category: "it_network", stayRef: "stay_1" }),
      sig({ id: "sv", locationCode: "312", occurredAt: "2026-07-06", topic: "wifi_weak", category: "it_network", source: "survey", stayRef: "stay_1" }),
      sig({ id: "u", locationCode: "312", occurredAt: "2026-07-04", topic: null, category: null, text: "something odd" }),
    ];
    const pairs = generateCandidates(s, index);
    expect(pairFor(pairs, "fd", "sv")?.score).toBe(0.9);
    const gray = pairFor(pairs, "fd", "u");
    expect(gray?.rule).toBe("same-place-unclassified");
    expect(gray!.score).toBeLessThan(0.6);
  });
});

describe("attachOrphanReviews", () => {
  it("attaches a review to the one cluster of its topic in the wing it mentions, within the time window", () => {
    const cluster = [
      sig({ id: "fd", locationCode: "312", occurredAt: "2026-07-02", topic: "wifi_weak", category: "it_network" }),
      sig({ id: "wo", locationCode: "312", occurredAt: "2026-07-03", topic: "wifi_weak", category: "it_network", source: "work_order" }),
    ];
    const other = [
      sig({ id: "c1", locationCode: "161", occurredAt: "2026-07-02", topic: "wifi_weak", category: "it_network" }),
      sig({ id: "c2", locationCode: "162", occurredAt: "2026-07-03", topic: "wifi_weak", category: "it_network" }),
    ];
    const review = sig({ id: "rv", locationCode: null, occurredAt: "2026-07-20", topic: "wifi_weak", category: "it_network", source: "review" });
    const stale = sig({ id: "old", locationCode: null, occurredAt: "2026-10-01", topic: "wifi_weak", category: "it_network", source: "review" });
    const unhinted = sig({ id: "nohint", locationCode: null, occurredAt: "2026-07-20", topic: "wifi_weak", category: "it_network", source: "review" });
    const hints = new Map([["rv", "A"], ["old", "A"], ["nohint", null]]);
    const links = attachOrphanReviews([review, stale, unhinted], [cluster, other], hints);
    expect(links.map((l) => l.a)).toEqual(["rv"]);
    expect(links[0].b).toBe("fd");
  });
});
