import { eq, sql } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, schema, type Db } from "../index";
import {
  readFrontDesk,
  readOccupancy,
  readReviews,
  readStays,
  readSurveys,
  readWorkOrders,
} from "../scripts/lib/data-files";
import { dataDir } from "../scripts/lib/paths";
import { countSignals, loadSynthetic } from "../scripts/load-synthetic";
import { findProperty } from "../scripts/seed";
import { TEST_URL } from "./env";

let db: Db;
let propertyId: string;
let tz: string;
const dir = dataDir();

beforeAll(async () => {
  db = createDb(TEST_URL, { max: 2 });
  const p = await findProperty(db);
  if (!p) throw new Error("seed missing");
  propertyId = p.id;
  tz = p.timezone;
});

afterAll(async () => {
  await db.$client.end();
});

describe("seed", () => {
  it("loads the full location hierarchy", async () => {
    const rows = await db
      .select({ kind: schema.locations.kind, n: sql<number>`count(*)::int` })
      .from(schema.locations)
      .where(eq(schema.locations.propertyId, propertyId))
      .groupBy(schema.locations.kind);
    const byKind = Object.fromEntries(rows.map((r) => [r.kind, r.n]));
    expect(byKind.property).toBe(1);
    expect(byKind.building).toBe(5);
    expect(byKind.room).toBe(298);
    expect(byKind.facility).toBe(11);
    expect(byKind.equipment).toBe(25);
    expect(byKind.floor).toBeGreaterThanOrEqual(11);
  });

  it("links shared equipment to what it serves", async () => {
    const [boiler] = await db
      .select({ id: schema.locations.id })
      .from(schema.locations)
      .where(eq(schema.locations.code, "C-BOILER"));
    const served = await db
      .select({ code: schema.locations.code })
      .from(schema.locationLinks)
      .innerJoin(schema.locations, eq(schema.locations.id, schema.locationLinks.servesId))
      .where(eq(schema.locationLinks.equipmentId, boiler.id));
    expect(served.map((s) => s.code).sort()).toEqual(["C", "REST-ELIA"]);
  });
});

describe("synthetic loader", () => {
  it("inserts one signal per export record", async () => {
    const counts = await countSignals(db, propertyId);
    const [wo, fd, sv, rv, st] = await Promise.all([
      readWorkOrders(dir, tz),
      readFrontDesk(dir, tz),
      readSurveys(dir, tz),
      readReviews(dir, tz),
      readStays(dir, tz),
    ]);
    expect(counts.work_order).toBe(wo.length);
    expect(counts.front_desk).toBe(fd.length);
    expect(counts.survey).toBe(sv.length);
    expect(counts.review).toBe(rv.length);
    expect(counts.pms).toBe(st.length);
  });

  it("matches the answer key's record count for the four signal exports", async () => {
    const key = JSON.parse(
      await readFile(path.join(dir, "answer_key.json"), "utf8"),
    ) as { signals: unknown[] };
    const counts = await countSignals(db, propertyId);
    const fourSources =
      counts.work_order + counts.front_desk + counts.survey + counts.review;
    expect(fourSources).toBe(key.signals.length);
  });

  it("loads occupancy per day per building and the pii stay keys", async () => {
    const occ = await readOccupancy(dir);
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.occupancyDaily)
      .where(eq(schema.occupancyDaily.propertyId, propertyId));
    expect(n).toBe(occ.length);

    const stays = await readStays(dir, tz);
    const [{ k }] = await db
      .select({ k: sql<number>`count(*)::int` })
      .from(schema.stayKeys)
      .where(eq(schema.stayKeys.propertyId, propertyId));
    expect(k).toBe(stays.length);
  });

  it("resolves typed room codes but leaves surveys and reviews unlocated", async () => {
    const rows = await db
      .select({
        source: schema.signals.source,
        method: schema.signals.locationMethod,
        n: sql<number>`count(*)::int`,
      })
      .from(schema.signals)
      .where(eq(schema.signals.propertyId, propertyId))
      .groupBy(schema.signals.source, schema.signals.locationMethod);
    const get = (source: string, method: string) =>
      rows.find((r) => r.source === source && r.method === method)?.n ?? 0;
    // PMS stays carry clean room codes: every one resolves exactly.
    expect(get("pms", "none")).toBe(0);
    // Front-desk rooms are mostly numbers or villa spellings.
    const fdTotal = rows.filter((r) => r.source === "front_desk").reduce((a, r) => a + r.n, 0);
    expect(get("front_desk", "exact") + get("front_desk", "alias")).toBeGreaterThan(fdTotal * 0.8);
    // Work orders are typed free text: a good share, never all.
    const woTotal = rows.filter((r) => r.source === "work_order").reduce((a, r) => a + r.n, 0);
    const woLocated = get("work_order", "exact") + get("work_order", "alias");
    expect(woLocated).toBeGreaterThan(woTotal * 0.3);
    expect(woLocated).toBeLessThan(woTotal);
    // The loader never resolves surveys or reviews itself (normalisation may, later).
    expect(get("survey", "exact") + get("survey", "alias")).toBe(0);
    expect(get("review", "exact") + get("review", "alias")).toBe(0);
  });

  it("writes a signal.created event for every signal", async () => {
    const [{ s }] = await db
      .select({ s: sql<number>`count(*)::int` })
      .from(schema.signals)
      .where(eq(schema.signals.propertyId, propertyId));
    const [{ e }] = await db
      .select({ e: sql<number>`count(*)::int` })
      .from(schema.events)
      .where(sql`${schema.events.propertyId} = ${propertyId} and ${schema.events.type} = 'signal.created'`);
    expect(e).toBe(s);
  });

  it("is idempotent: a second run inserts nothing", async () => {
    const before = await countSignals(db, propertyId);
    const res = await loadSynthetic(db);
    expect(Object.values(res.inserted).reduce((a, b) => a + b, 0)).toBe(0);
    const after = await countSignals(db, propertyId);
    expect(after).toEqual(before);
  });
});
