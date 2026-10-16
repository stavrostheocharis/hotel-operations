import { describe, expect, it } from "vitest";
import { LocationIndex, type LocationRow } from "@/normalize/location-rules";
import { clusterPairs } from "../cluster";
import { buildIssue } from "../issues";
import type { CandidatePair, LinkSignal } from "../types";

function row(code: string, kind: LocationRow["kind"], attributes: Record<string, unknown> = {}): LocationRow {
  return { id: `id-${code}`, code, kind, aliases: [], attributes };
}
const index = new LocationIndex([
  row("C", "building"), row("C/1", "floor"),
  row("161", "room", { building: "C", floor: 1 }), row("162", "room", { building: "C", floor: 1 }), row("163", "room", { building: "C", floor: 1 }),
  row("V12", "room", { building: "V", floor: 0, is_villa: true }), row("V", "building"),
  row("C-BOILER", "equipment", { building: "C" }), row("REST-ORIZONTAS", "facility"),
]);

let n = 0;
type SigInput = Omit<Partial<LinkSignal>, "occurredAt" | "locationCode"> & { locationCode: string; occurredAt: string };
function sig(p: SigInput): LinkSignal {
  n++;
  const r = index.byCode.get(p.locationCode)!;
  return {
    id: p.id ?? `s${n}`,
    source: p.source ?? "front_desk",
    externalId: p.externalId ?? String(n),
    occurredAt: new Date(p.occurredAt),
    locationCode: p.locationCode,
    locationKind: r.kind,
    building: r.kind === "building" ? r.code : (r.attributes.building as string) ?? null,
    topic: p.topic ?? "no_hot_water",
    category: p.category ?? "plumbing",
    stayRef: p.stayRef ?? null,
    text: p.text ?? "text",
    wo: p.wo ?? null,
    stayCheckIn: p.stayCheckIn ?? null,
  };
}
const wo = (created: string, closed: string | null) => ({
  createdAt: new Date(created), closedAt: closed ? new Date(closed) : null, status: closed ? "Closed" : "Open", reopened: null, closureNote: "done", technician: "T-01",
});
const pair = (a: string, b: string, rule = "same-place-topic"): CandidatePair => ({ a, b, score: 0.9, rule, method: "rule", evidence: {} });

describe("clusterPairs", () => {
  it("unions transitively and keeps singletons", () => {
    const clusters = clusterPairs(["a", "b", "c", "d"], [pair("a", "b"), pair("b", "c")]);
    const sorted = clusters.map((c) => c.sort()).sort((x, y) => y.length - x.length);
    expect(sorted).toEqual([["a", "b", "c"], ["d"]]);
  });
});

describe("buildIssue", () => {
  it("reopens when a live complaint follows a ticket closure, and the fix did not hold", () => {
    const s = [
      sig({ id: "fd1", locationCode: "V12", occurredAt: "2026-06-14T09:00Z", topic: "ac_not_cooling", category: "hvac" }),
      sig({ id: "wo1", locationCode: "V12", occurredAt: "2026-06-15T10:00Z", topic: "ac_not_cooling", category: "hvac", source: "work_order", wo: wo("2026-06-15T10:00Z", "2026-06-15T16:00Z") }),
      sig({ id: "fd2", locationCode: "V12", occurredAt: "2026-07-09T21:00Z", topic: "ac_not_cooling", category: "hvac" }),
      sig({ id: "wo2", locationCode: "V12", occurredAt: "2026-07-09T22:00Z", topic: "ac_not_cooling", category: "hvac", source: "work_order", wo: wo("2026-07-09T22:00Z", "2026-07-10T12:00Z") }),
      sig({ id: "rv", locationCode: "V12", occurredAt: "2026-07-27", topic: "ac_not_cooling", category: "hvac", source: "review" }),
    ];
    const issue = buildIssue(s, [pair("fd1", "wo1"), pair("wo1", "fd2"), pair("fd2", "wo2"), pair("wo2", "rv")], index, new Date("2026-10-31"));
    expect(issue.locationCode).toBe("V12");
    expect(issue.reopenCount).toBe(1);
    expect(issue.recurred).toBe(true);
    // The review a fortnight later does not count as evidence; the second fix held.
    expect(issue.fixHeld).toBe(true);
    expect(issue.status).toBe("closed_unverified");
    expect(issue.episodes).toBe(2);
    expect(issue.primaryId).toBe("fd1");
  });

  it("stays open without a closure and counts episodes for process problems", () => {
    const s = [
      sig({ id: "a", locationCode: "REST-ORIZONTAS", occurredAt: "2026-08-02", topic: "breakfast_slow", category: "fnb_service" }),
      sig({ id: "b", locationCode: "REST-ORIZONTAS", occurredAt: "2026-08-04", topic: "breakfast_slow", category: "fnb_service", source: "survey" }),
      sig({ id: "c", locationCode: "REST-ORIZONTAS", occurredAt: "2026-08-20", topic: "breakfast_slow", category: "fnb_service" }),
    ];
    const issue = buildIssue(s, [pair("a", "b"), pair("b", "c")], index, new Date("2026-10-31"));
    expect(issue.status).toBe("detected");
    expect(issue.fixHeld).toBeNull();
    expect(issue.episodes).toBe(2);
    expect(issue.recurred).toBe(true);
    expect(issue.locationCode).toBe("REST-ORIZONTAS");
  });

  it("names the shared equipment as root cause of a building cluster and treats a duplicate ticket as such", () => {
    const s = [
      sig({ id: "a", locationCode: "161", occurredAt: "2026-06-12" }),
      sig({ id: "b", locationCode: "162", occurredAt: "2026-06-13" }),
      sig({ id: "c", locationCode: "163", occurredAt: "2026-06-14" }),
      sig({ id: "w1", locationCode: "162", occurredAt: "2026-06-13T12:00Z", source: "work_order", wo: wo("2026-06-13T12:00Z", "2026-06-13T15:00Z") }),
      sig({ id: "w2", locationCode: "162", occurredAt: "2026-06-13T14:00Z", source: "work_order", wo: wo("2026-06-13T14:00Z", "2026-06-13T15:30Z") }),
      sig({ id: "e", locationCode: "C-BOILER", occurredAt: "2026-06-15", source: "work_order", wo: wo("2026-06-15", "2026-06-16") }),
    ];
    const pairs = [pair("a", "b", "building-cluster"), pair("b", "c", "building-cluster"), pair("e", "a", "building-cluster:equipment"), pair("w1", "b"), pair("w2", "b")];
    const issue = buildIssue(s, pairs, index, new Date("2026-10-31"));
    expect(issue.locationCode).toBe("C-BOILER");
    expect(issue.duplicateIds.has("w2")).toBe(true);
    expect(issue.duplicateIds.has("w1")).toBe(false);
    expect(issue.rootCause).toMatch(/shared equipment C-BOILER/);
  });

  it("falls back to the floor or the building when no equipment ticket exists", () => {
    const s = [
      sig({ id: "a", locationCode: "161", occurredAt: "2026-06-12", topic: "mosquitoes", category: "pest" }),
      sig({ id: "b", locationCode: "162", occurredAt: "2026-06-13", topic: "mosquitoes", category: "pest" }),
      sig({ id: "c", locationCode: "163", occurredAt: "2026-06-14", topic: "mosquitoes", category: "pest" }),
    ];
    const issue = buildIssue(s, [pair("a", "b", "building-cluster"), pair("b", "c", "building-cluster")], index, new Date("2026-10-31"));
    expect(issue.locationCode).toBe("C/1");
  });
});
