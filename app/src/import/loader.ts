import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { schema, type Db } from "@/db";
import { buildingAliases, equipmentAliases, facilityAliases, floorAliases, floorCode, LocationResolver, parseServes, roomAliases, type BuildingDef } from "@/db/scripts/lib/locations";
import { stayRef } from "@/db/scripts/lib/stay-ref";
import { zonedToUtc } from "@/db/scripts/lib/time";
import { findProperty } from "@/db/scripts/seed";
import { classifyDate, withTime } from "@/reality/dates";
import { readExportFolder } from "@/reality/read";
import type { ParsedFile } from "@/reality/types";
import { missingForLoad, project, type FileMapping, type ImportMapping, type Rec } from "./mapping";
import { insertSignalsScrubbed, type InsertSummary, type SignalInsert } from "./signals";

/**
 * The real-export loader: a client's folder, as delivered, becomes the
 * same rows the synthetic loader produces — through the mapping the
 * reality check worked out (and a person may have corrected). Lists first
 * (rooms, facilities, equipment become places), then stays, then every
 * record source; `mapped` on each signal is the record in the data
 * request's own field names, so normalisation and linking never see the
 * export's layout. Re-running is harmless: a record already present
 * (property + source + external id) is skipped.
 */
export type LoadOptions = {
  propertyCode: string;
  dir: string;
  mapping: ImportMapping;
  batchId: string;
  log?: (line: string) => void;
  onProgress?: (message: string) => void;
};

export type LoadResult = {
  sources: Record<string, InsertSummary>;
  locations: { created: number; links: number };
  stayKeys: number;
  occupancy: number;
  skipped: { path: string; reason: string }[];
};

const ORDER = ["rooms", "facilities", "equipment", "stays", "work_orders", "complaints", "compensation", "surveys", "reviews", "occupancy"] as const;

export async function loadBatch(db: Db, o: LoadOptions): Promise<LoadResult> {
  const log = o.log ?? (() => {});
  const progress = o.onProgress ?? (() => {});
  const property = await findProperty(db, o.propertyCode);
  if (!property) throw new Error("property not seeded");
  const tz = property.timezone;
  const tenant = { groupId: property.groupId, propertyId: property.id };
  const result: LoadResult = { sources: {}, locations: { created: 0, links: 0 }, stayKeys: 0, occupancy: 0, skipped: [] };

  progress("reading the files");
  const { files } = await readExportFolder(o.dir);
  const byPath = new Map(files.map((f) => [f.path, f]));
  const plan = ORDER.flatMap((ds) => o.mapping.files.filter((m) => m.dataset === ds));

  const loadLocations = async () => {
    const rows = await db.select({ id: schema.locations.id, code: schema.locations.code, kind: schema.locations.kind, aliases: schema.locations.aliases, parentId: schema.locations.parentId, name: schema.locations.name }).from(schema.locations).where(eq(schema.locations.propertyId, property.id));
    return rows;
  };
  let locationRows = await loadLocations();
  let resolver = new LocationResolver(locationRows);
  const root = locationRows.find((l) => l.kind === "property");
  if (!root) throw new Error("the property has no root location; run db:seed");

  const upsert = async (row: { kind: (typeof schema.locationKind.enumValues)[number]; code: string; name: string; parentId: string | null; aliases: string[]; attributes?: Record<string, unknown> }): Promise<{ id: string; created: boolean }> => {
    const existing = locationRows.find((l) => l.code.toUpperCase() === row.code.toUpperCase());
    if (existing) return { id: existing.id, created: false };
    const [ins] = await db
      .insert(schema.locations)
      .values({ ...tenant, kind: row.kind, code: row.code.toUpperCase(), name: row.name, parentId: row.parentId, aliases: Array.from(new Set(row.aliases.filter(Boolean))), attributes: row.attributes ?? {} })
      .onConflictDoNothing()
      .returning({ id: schema.locations.id });
    if (!ins) {
      locationRows = await loadLocations();
      return { id: locationRows.find((l) => l.code.toUpperCase() === row.code.toUpperCase())!.id, created: false };
    }
    locationRows.push({ id: ins.id, code: row.code.toUpperCase(), kind: row.kind, aliases: row.aliases, parentId: row.parentId, name: row.name });
    result.locations.created++;
    return { id: ins.id, created: true };
  };

  const buildingFor = async (text: string | undefined, name?: string): Promise<{ id: string; code: string } | null> => {
    if (!text?.trim()) return null;
    const hit = resolver.resolve(text);
    const found = hit ? locationRows.find((l) => l.id === hit.id) : undefined;
    if (found?.kind === "building") return { id: found.id, code: found.code };
    const code = slugCode(text);
    const def: BuildingDef = { code, name: (name ?? text).trim(), floors: [] };
    const { id } = await upsert({ kind: "building", code, name: def.name, parentId: root.id, aliases: [text.trim(), ...buildingAliases(def)] });
    resolver = new LocationResolver(locationRows);
    return { id, code };
  };

  for (const m of plan) {
    const file = byPath.get(m.path);
    if (!file) {
      result.skipped.push({ path: m.path, reason: "file not found" });
      continue;
    }
    const missing = missingForLoad(m);
    if (missing.length) {
      result.skipped.push({ path: m.path, reason: `no column for ${missing.join(", ")}` });
      continue;
    }
    const recs = project(file, m);
    const date = (v: string | undefined, time?: string) => parseDate(v, time, m.monthFirst, tz);
    progress(`${m.dataset}: ${recs.length} rows`);
    log(`${m.path} → ${m.dataset}: ${recs.length} rows`);

    switch (m.dataset) {
      case "rooms": {
        for (const { rec } of recs) {
          const code = (rec.room_code ?? "").trim();
          if (!code) continue;
          const building = await buildingFor(rec.building || rec.building_name, rec.building_name);
          let parentId = building?.id ?? root.id;
          const floorNum = rec.floor !== undefined && rec.floor !== "" && Number.isFinite(Number(rec.floor)) ? Number(rec.floor) : null;
          const isVilla = /^(y|yes|true|1|villa|bungalow)$/i.test(rec.is_villa ?? "");
          // villas sit under their building; only hotel rooms get a floor level
          if (building && floorNum !== null && !isVilla) {
            const def: BuildingDef = { code: building.code, name: rec.building_name || rec.building || building.code, floors: [floorNum] };
            const f = await upsert({ kind: "floor", code: floorCode(building.code, floorNum), name: `${def.name} floor ${floorNum}`, parentId: building.id, aliases: floorAliases(def, floorNum), attributes: { floor: floorNum } });
            parentId = f.id;
          }
          const roomRow = { roomCode: code, building: building?.code ?? "", buildingName: rec.building_name ?? rec.building ?? "", floor: rec.floor ?? "", roomType: rec.room_type ?? "", view: rec.view ?? "", isVilla };
          await upsert({ kind: "room", code, name: isVilla ? `Villa ${code.replace(/^V/i, "")}` : `Room ${code}`, parentId, aliases: roomAliases(roomRow), attributes: { building: building?.code ?? null, floor: floorNum, room_type: rec.room_type ?? null, view: rec.view ?? null, is_villa: isVilla } });
        }
        resolver = new LocationResolver(locationRows);
        break;
      }
      case "facilities": {
        for (const { rec } of recs) {
          const name = (rec.name ?? "").trim();
          if (!name) continue;
          const code = (rec.code ?? "").trim().toUpperCase() || slugCode(name);
          const f = { code, name, type: rec.type ?? "", area: rec.area ?? "", notes: rec.notes ?? "" };
          await upsert({ kind: "facility", code, name, parentId: root.id, aliases: facilityAliases(f), attributes: { type: f.type, area: f.area, notes: f.notes } });
        }
        resolver = new LocationResolver(locationRows);
        break;
      }
      case "equipment": {
        const known = { buildings: new Set(locationRows.filter((l) => l.kind === "building").map((l) => l.code)), facilities: new Map(locationRows.filter((l) => l.kind === "facility").flatMap((l) => [[l.code, l.code], [l.name, l.code], ...l.aliases.map((a) => [a, l.code] as [string, string])])) };
        for (const { rec } of recs) {
          const name = (rec.name ?? "").trim();
          if (!name) continue;
          const id = (rec.id ?? "").trim().toUpperCase() || slugCode(name);
          const building = await buildingFor(rec.building);
          const e = { id, name, type: rec.type ?? "", building: building?.code ?? "", locationText: rec.location ?? "", serves: rec.serves ?? "", installedYear: rec.installed_year ?? "" };
          const { codes, unresolved } = parseServes(e.serves, known);
          const eq = await upsert({ kind: "equipment", code: id, name, parentId: building?.id ?? root.id, aliases: equipmentAliases(e), attributes: { type: e.type, building: e.building || null, location_text: e.locationText, installed_year: e.installedYear || null, serves_text: e.serves, serves_unresolved: unresolved } });
          for (const code of codes) {
            const target = locationRows.find((l) => l.code === code);
            if (!target) continue;
            const r = await db.insert(schema.locationLinks).values({ ...tenant, equipmentId: eq.id, servesId: target.id }).onConflictDoNothing().returning({ id: schema.locationLinks.id });
            result.locations.links += r.length;
          }
        }
        resolver = new LocationResolver(locationRows);
        break;
      }
      case "stays": {
        const keys = recs.filter(({ rec }) => rec.stay_key).map(({ rec }) => ({ propertyId: property.id, stayRef: stayRef(property.code, rec.stay_key), reservationNo: rec.stay_key }));
        for (let i = 0; i < keys.length; i += 1000) {
          const r = await db.insert(schema.stayKeys).values(keys.slice(i, i + 1000)).onConflictDoNothing().returning({ id: schema.stayKeys.id });
          result.stayKeys += r.length;
        }
        const rows: SignalInsert[] = [];
        for (const { rec, raw } of recs) {
          const arrival = date(rec.arrival);
          if (!rec.stay_key || !arrival) continue;
          rows.push({
            ...tenant,
            source: "pms",
            externalId: rec.stay_key,
            occurredAt: arrival,
            stayRef: stayRef(property.code, rec.stay_key),
            raw,
            mapped: { stay_key: rec.stay_key, room: rec.room ?? null, arrival: arrival.toISOString(), departure: date(rec.departure)?.toISOString() ?? null, adults: rec.adults ?? null, children: rec.children ?? null, nationality: rec.nationality ?? null, segment: rec.segment ?? null, board: rec.board ?? null },
            ingestBatchId: o.batchId,
            ...locate(resolver, rec.room),
          });
        }
        result.sources.pms = await insertSignalsScrubbed(db, tenant, "pms", rows, o.batchId, log);
        break;
      }
      case "work_orders": {
        const rows: SignalInsert[] = [];
        for (const { rec, raw } of recs) {
          const created = date(rec.created_at);
          if (!created) continue;
          const id = (rec.id ?? "").trim() || hashOf(raw);
          rows.push({
            ...tenant,
            source: "work_order",
            externalId: id,
            occurredAt: created,
            textOriginal: rec.description || null,
            category: rec.category || null,
            stayRef: rec.stay_key ? stayRef(property.code, rec.stay_key) : null,
            raw,
            mapped: { id, created_at: created.toISOString(), closed_at: date(rec.closed_at)?.toISOString() ?? null, status: rec.status ?? null, location: rec.location ?? null, category: rec.category ?? null, description: rec.description ?? null, closure_note: rec.closure_note ?? null, assigned_to: rec.assigned_to ?? null, priority: rec.priority ?? null, reopened: rec.reopened ?? null, created_by: rec.created_by ?? null, reported_via: rec.reported_via ?? null, asset_id: rec.asset_id ?? null },
            ingestBatchId: o.batchId,
            ...locate(resolver, rec.location),
          });
        }
        result.sources.work_order = await insertSignalsScrubbed(db, tenant, "work_order", rows, o.batchId, log);
        break;
      }
      case "complaints": {
        const rows: SignalInsert[] = [];
        for (const { rec, raw } of recs) {
          const at = date(rec.occurred_at, rec.time);
          if (!at) continue;
          const id = (rec.id ?? "").trim() || hashOf(raw);
          rows.push({
            ...tenant,
            source: "front_desk",
            externalId: id,
            occurredAt: at,
            textOriginal: rec.description || null,
            stayRef: rec.stay_key ? stayRef(property.code, rec.stay_key) : null,
            raw,
            mapped: { id, occurred_at: at.toISOString(), room: rec.room ?? null, category: rec.category ?? null, description: rec.description ?? null, resolution: rec.resolution ?? null, agent_note: rec.agent_note ?? null, department: rec.department ?? null, resolved_at: date(rec.resolved_at)?.toISOString() ?? null, work_order_id: rec.work_order_id ?? null, severity: rec.severity ?? null, channel: rec.channel ?? null, shift: rec.shift ?? null },
            ingestBatchId: o.batchId,
            ...locate(resolver, rec.room),
          });
        }
        result.sources.front_desk = await insertSignalsScrubbed(db, tenant, "front_desk", rows, o.batchId, log);
        break;
      }
      case "compensation": {
        const rows: SignalInsert[] = [];
        for (const { rec, raw } of recs) {
          const at = date(rec.date);
          if (!at) continue;
          rows.push({
            ...tenant,
            source: "compensation",
            externalId: hashOf(raw),
            occurredAt: at,
            textOriginal: rec.reason || null,
            stayRef: rec.stay_key ? stayRef(property.code, rec.stay_key) : null,
            raw,
            mapped: { date: at.toISOString(), room: rec.room ?? null, reason: rec.reason ?? null, type: rec.type ?? null, value: rec.value ?? null },
            ingestBatchId: o.batchId,
            ...locate(resolver, rec.room),
          });
        }
        result.sources.compensation = await insertSignalsScrubbed(db, tenant, "compensation", rows, o.batchId, log);
        break;
      }
      case "surveys": {
        const rows: SignalInsert[] = [];
        for (const { rec, raw } of recs) {
          const at = date(rec.submitted_at) ?? date(rec.departure_date);
          if (!at) continue;
          const id = (rec.id ?? "").trim() || hashOf(raw);
          rows.push({
            ...tenant,
            source: "survey",
            externalId: id,
            occurredAt: at,
            language: rec.language?.trim().toLowerCase().slice(0, 7) || null,
            textOriginal: rec.comment || null,
            stayRef: rec.stay_key ? stayRef(property.code, rec.stay_key) : null,
            raw,
            mapped: { id, submitted_at: at.toISOString(), stay_key: rec.stay_key ?? null, room: rec.room ?? null, overall: rec.overall ?? null, nps: rec.nps ?? null, would_recommend: rec.would_recommend ?? null, comment: rec.comment ?? null, language: rec.language ?? null, building: rec.building ?? null, room_type: rec.room_type ?? null },
            ingestBatchId: o.batchId,
            ...locate(resolver, rec.room),
          });
        }
        result.sources.survey = await insertSignalsScrubbed(db, tenant, "survey", rows, o.batchId, log);
        break;
      }
      case "reviews": {
        const rows: SignalInsert[] = [];
        for (const { rec, raw } of recs) {
          const at = date(firstOf(rec.review_date));
          const text = rec.text || rec.title;
          if (!at || !text) continue;
          const id = (rec.id ?? "").trim() || hashOf(raw);
          rows.push({
            ...tenant,
            source: "review",
            externalId: id,
            occurredAt: at,
            language: rec.language?.trim().toLowerCase().slice(0, 7) || null,
            textOriginal: text,
            raw,
            mapped: { id, platform: rec.platform ?? null, review_date: at.toISOString(), rating: rec.rating ?? null, title: rec.title ?? null, text, language: rec.language ?? null, stay_dates: rec.stay_dates ?? null, room_type: rec.room_type ?? null, traveller_type: rec.traveller_type ?? null, nights: rec.nights ?? null },
            ingestBatchId: o.batchId,
          });
        }
        result.sources.review = await insertSignalsScrubbed(db, tenant, "review", rows, o.batchId, log);
        break;
      }
      case "occupancy": {
        const values: (typeof schema.occupancyDaily.$inferInsert)[] = [];
        for (const { rec } of recs) {
          const day = parseDate(rec.date, undefined, m.monthFirst, "UTC");
          const occupied = Number(rec.rooms_occupied);
          if (!day || !Number.isFinite(occupied)) continue;
          const hit = rec.building ? resolver.resolve(rec.building) : null;
          const target = hit ? locationRows.find((l) => l.id === hit.id) : undefined;
          values.push({
            ...tenant,
            day: day.toISOString().slice(0, 10),
            locationId: target && target.kind === "building" ? target.id : root.id,
            roomsAvailable: Number.isFinite(Number(rec.rooms_available)) ? Number(rec.rooms_available) : 0,
            roomsOccupied: occupied,
            arrivals: Number.isFinite(Number(rec.arrivals)) ? Number(rec.arrivals) : null,
            departures: Number.isFinite(Number(rec.departures)) ? Number(rec.departures) : null,
          });
        }
        for (let i = 0; i < values.length; i += 500) {
          const r = await db.insert(schema.occupancyDaily).values(values.slice(i, i + 500)).onConflictDoNothing().returning({ id: schema.occupancyDaily.id });
          result.occupancy += r.length;
        }
        log(`occupancy: ${values.length} rows, ${result.occupancy} inserted`);
        break;
      }
    }
  }

  await db.insert(schema.events).values({ ...tenant, entityType: "property", entityId: property.id, type: "ingest.completed", payload: { batch_id: o.batchId, inserted: Object.fromEntries(Object.entries(result.sources).map(([k, v]) => [k, v.inserted])), locations: result.locations, occupancy: result.occupancy } });
  return result;
}

// ---------------------------------------------------------------------------

function locate(resolver: LocationResolver, text: string | undefined): Pick<SignalInsert, "locationId" | "locationMethod" | "locationConfidence"> {
  const hit = text ? resolver.resolve(text) : null;
  return hit ? { locationId: hit.id, locationMethod: hit.method, locationConfidence: hit.method === "exact" ? "1.000" : "0.950" } : { locationId: null, locationMethod: "none", locationConfidence: null };
}

/** A date cell in the export, as an instant in the property's time zone. */
export function parseDate(value: string | undefined, time: string | undefined, monthFirst: boolean, tz: string): Date | null {
  if (!value?.trim()) return null;
  const hit = classifyDate(value.trim(), monthFirst);
  if (!hit) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const parts = time ? withTime(hit.parts, time) : hit.parts;
  return zonedToUtc({ year: parts.year, month: parts.month, day: parts.monthOnly ? 1 : parts.day, hour: parts.hour, minute: parts.minute }, tz);
}

function firstOf(v: string | undefined): string | undefined {
  return v?.split(" / ")[0];
}

function hashOf(raw: Rec): string {
  return createHash("sha1").update(JSON.stringify(raw)).digest("hex").slice(0, 16);
}

function slugCode(text: string): string {
  const s = text
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return s.slice(0, 24) || "X";
}

export type { ParsedFile, FileMapping };
