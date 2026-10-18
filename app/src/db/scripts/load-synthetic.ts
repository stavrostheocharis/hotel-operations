import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { createDb, schema, type Db } from "../index";
import {
  readFrontDesk,
  readOccupancy,
  readReviews,
  readStays,
  readSurveys,
  readWorkOrders,
} from "./lib/data-files";
import { LocationResolver } from "./lib/locations";
import { dataDir } from "./lib/paths";
import { parseDmyHm } from "./lib/time";
import { stayRef } from "./lib/stay-ref";
import { findProperty } from "./seed";
import { insertSignalsScrubbed } from "@/import/signals";

type SignalInsert = typeof schema.signals.$inferInsert;

export type LoadOptions = {
  dataDir?: string;
  propertyCode?: string;
  log?: (msg: string) => void;
};

export type LoadResult = {
  batchId: string;
  inserted: Record<string, number>;
  skipped: Record<string, number>;
  located: Record<string, number>;
  occupancyRows: number;
  stayKeys: number;
};

/**
 * Load the raw exports into `signals`, one row per record, with the original
 * row kept in `raw`. No translation, classification or linking happens here;
 * the only enrichment is an exact / alias match of the typed location against
 * the seeded hierarchy. Idempotent: existing (property, source, external_id)
 * rows are left untouched.
 */
export async function loadSynthetic(
  db: Db,
  opts: LoadOptions = {},
): Promise<LoadResult> {
  const log = opts.log ?? (() => {});
  const dir = opts.dataDir ?? dataDir();
  const property = await findProperty(db, opts.propertyCode ?? "ASTRAEA");
  if (!property) throw new Error("property not seeded; run db:seed first");
  const tenant = { groupId: property.groupId, propertyId: property.id };
  const tz = property.timezone;
  const batchId = randomUUID();

  const locationRows = await db
    .select({
      id: schema.locations.id,
      code: schema.locations.code,
      aliases: schema.locations.aliases,
    })
    .from(schema.locations)
    .where(eq(schema.locations.propertyId, property.id));
  const resolver = new LocationResolver(locationRows);

  const inserted: Record<string, number> = {};
  const skipped: Record<string, number> = {};
  const located: Record<string, number> = {};

  const insertSignals = async (source: string, rows: SignalInsert[]) => {
    const r = await insertSignalsScrubbed(db, tenant, source, rows, batchId, log);
    inserted[source] = r.inserted;
    skipped[source] = r.skipped;
    located[source] = r.located;
  };

  const locate = (text: string) => {
    const hit = resolver.resolve(text);
    return hit
      ? {
          locationId: hit.id,
          locationMethod: hit.method,
          locationConfidence: hit.method === "exact" ? "1.000" : "0.950",
        }
      : { locationId: null, locationMethod: "none" as const, locationConfidence: null };
  };

  // 1. Work orders
  const workOrders = await readWorkOrders(dir, tz);
  await insertSignals(
    "work_order",
    workOrders
      .filter((w) => w.externalId && w.occurredAt)
      .map((w) => ({
        ...tenant,
        source: "work_order" as const,
        externalId: w.externalId,
        occurredAt: w.occurredAt!,
        language: null,
        textOriginal: w.description || null,
        category: w.category || null,
        raw: w.raw,
        mapped: {
          id: w.externalId,
          created_at: w.occurredAt!.toISOString(),
          closed_at: parseDmyHm(String(w.raw["Closed"] ?? ""), tz)?.toISOString() ?? null,
          status: w.raw["Status"] ?? null,
          location: w.locationText,
          category: w.category || null,
          description: w.description || null,
          closure_note: w.raw["Closure Note"] ?? null,
          assigned_to: w.raw["Technician"] ?? null,
          priority: w.raw["Priority"] ?? null,
          reopened: w.raw["Reopened"] || null,
          created_by: w.raw["Reported By"] ?? null,
        },
        ingestBatchId: batchId,
        ...locate(w.locationText),
      })),
  );

  // 2. Front-desk log
  const frontDesk = await readFrontDesk(dir, tz);
  await insertSignals(
    "front_desk",
    frontDesk
      .filter((f) => f.occurredAt)
      .map((f) => ({
        ...tenant,
        source: "front_desk" as const,
        externalId: f.externalId,
        occurredAt: f.occurredAt!,
        language: null,
        textOriginal: f.guestComment || null,
        raw: f.raw,
        mapped: {
          id: f.externalId,
          occurred_at: f.occurredAt!.toISOString(),
          room: f.roomText || null,
          description: f.guestComment || null,
          agent_note: f.agentNote || null,
          department: f.raw["Dept"] ?? null,
          resolution: f.raw["Resolution"] ?? null,
          shift: f.raw["Shift"] ?? null,
        },
        ingestBatchId: batchId,
        ...locate(f.roomText),
      })),
  );

  // 3. Stays (PMS) and the pii mapping
  const stays = await readStays(dir, tz);
  const stayKeyRows = stays.map((s) => ({
    propertyId: property.id,
    stayRef: stayRef(property.code, s.reservationNo),
    reservationNo: s.reservationNo,
  }));
  let stayKeys = 0;
  for (let i = 0; i < stayKeyRows.length; i += 1000) {
    const r = await db
      .insert(schema.stayKeys)
      .values(stayKeyRows.slice(i, i + 1000))
      .onConflictDoNothing()
      .returning({ id: schema.stayKeys.id });
    stayKeys += r.length;
  }
  log(`pii.stay_keys: ${stayKeyRows.length} rows, ${stayKeys} inserted`);
  await insertSignals(
    "pms",
    stays
      .filter((s) => s.checkIn)
      .map((s) => ({
        ...tenant,
        source: "pms" as const,
        externalId: s.reservationNo,
        occurredAt: s.checkIn!,
        stayRef: stayRef(property.code, s.reservationNo),
        raw: s.raw,
        mapped: { stay_key: s.reservationNo, room: s.room, arrival: s.checkIn!.toISOString(), departure: s.checkOut?.toISOString() ?? null },
        ingestBatchId: batchId,
        ...locate(s.room),
      })),
  );

  // 4. Surveys (no room: reach the stay through stay_ref later)
  const surveys = await readSurveys(dir, tz);
  await insertSignals(
    "survey",
    surveys
      .filter((s) => s.occurredAt)
      .map((s) => ({
        ...tenant,
        source: "survey" as const,
        externalId: s.externalId,
        occurredAt: s.occurredAt!,
        language: s.language || null,
        textOriginal: s.comment || null,
        stayRef: stayRef(property.code, s.reservationNo),
        raw: s.raw,
        mapped: {
          id: s.externalId,
          submitted_at: s.occurredAt!.toISOString(),
          stay_key: s.reservationNo,
          overall: s.raw["overall"] ?? null,
          nps: s.raw["nps"] ?? null,
          would_recommend: s.raw["would_recommend"] ?? null,
          comment: s.comment || null,
          language: s.language || null,
        },
        ingestBatchId: batchId,
      })),
  );

  // 5. Reviews
  const reviews = await readReviews(dir, tz);
  await insertSignals(
    "review",
    reviews
      .filter((r) => r.occurredAt)
      .map((r) => ({
        ...tenant,
        source: "review" as const,
        externalId: r.externalId,
        occurredAt: r.occurredAt!,
        language: r.language || null,
        textOriginal: r.text || null,
        raw: r.raw,
        mapped: {
          id: r.externalId,
          platform: r.platform,
          review_date: r.occurredAt!.toISOString(),
          rating: r.raw["rating"] ?? r.raw["score"] ?? null,
          title: r.raw["title"] ?? null,
          text: r.text || null,
          language: r.language || null,
        },
        ingestBatchId: batchId,
      })),
  );

  // 6. Occupancy by day per building (a metric, not a signal)
  const occupancy = await readOccupancy(dir);
  const buildingIds = new Map(
    locationRows
      .filter((l) => /^[A-Z]$/.test(l.code))
      .map((l) => [l.code, l.id]),
  );
  let occupancyRows = 0;
  const occValues = occupancy
    .filter((o) => buildingIds.has(o.building))
    .map((o) => ({
      ...tenant,
      day: o.day,
      locationId: buildingIds.get(o.building)!,
      roomsAvailable: o.roomsAvailable,
      roomsOccupied: o.roomsOccupied,
      arrivals: o.arrivals,
      departures: o.departures,
    }));
  for (let i = 0; i < occValues.length; i += 1000) {
    const r = await db
      .insert(schema.occupancyDaily)
      .values(occValues.slice(i, i + 1000))
      .onConflictDoUpdate({
        target: [
          schema.occupancyDaily.propertyId,
          schema.occupancyDaily.day,
          schema.occupancyDaily.locationId,
        ],
        set: {
          roomsAvailable: schema.occupancyDaily.roomsAvailable,
          roomsOccupied: schema.occupancyDaily.roomsOccupied,
        },
      })
      .returning({ id: schema.occupancyDaily.id });
    occupancyRows += r.length;
  }
  log(`occupancy_daily: ${occValues.length} rows upserted`);

  await db.insert(schema.events).values({
    ...tenant,
    entityType: "property",
    entityId: property.id,
    type: "ingest.completed",
    payload: { batch_id: batchId, inserted, skipped, located },
  });

  return { batchId, inserted, skipped, located, occupancyRows, stayKeys };
}

/** Count signals per source for a property (used by tests and reports). */
export async function countSignals(db: Db, propertyId: string) {
  const rows = await db
    .select({ source: schema.signals.source, count: schema.signals.id })
    .from(schema.signals)
    .where(and(eq(schema.signals.propertyId, propertyId)));
  const out: Record<string, number> = {};
  for (const r of rows) out[r.source] = (out[r.source] ?? 0) + 1;
  return out;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (copy .env.example to .env)");
  const db = createDb(url, { max: 1 });
  try {
    const res = await loadSynthetic(db, { log: console.log });
    console.log(`batch ${res.batchId} done`);
  } finally {
    await db.$client.end();
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
