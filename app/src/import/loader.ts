import { eq } from "drizzle-orm";
import { schema, type Db } from "@/db";
import { buildingAliases, equipmentAliases, facilityAliases, floorAliases, floorCode, knownPlaces, LocationResolver, parseServes, roomAliases, type BuildingDef } from "@/db/scripts/lib/locations";
import { hash4, slugCode } from "@/db/scripts/lib/codes";
import { stableKey } from "./keys";
import { staffRef, stayRef } from "@/db/scripts/lib/stay-ref";
import { zonedToUtc } from "@/db/scripts/lib/time";
import { findProperty, findPropertyById } from "@/db/scripts/seed";
import { classifyDate, withTime } from "@/reality/dates";
import { readExportFolder } from "@/reality/read";
import type { ParsedFile } from "@/reality/types";
import { missingForLoad, project, type FileMapping, type ImportMapping, validateMapping } from "./mapping";
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
  /** Wins over the code: codes repeat across groups. */
  propertyId?: string;
  dir: string;
  mapping: ImportMapping;
  batchId: string;
  log?: (line: string) => void;
  onProgress?: (message: string) => void;
};

export type LoadResult = {
  sources: Record<string, InsertSummary>;
  /** Rows the loader could not use, per source and reason ("no usable date", "no stay key"). */
  rejected?: Record<string, Record<string, number>>;
  locations: { created: number; links: number };
  stayKeys: number;
  occupancy: number;
  skipped: { path: string; reason: string }[];
};

const ORDER = ["rooms", "facilities", "equipment", "stays", "work_orders", "complaints", "compensation", "surveys", "reviews", "occupancy"] as const;

const KIND_SUFFIX: Record<string, string> = { building: "BLDG", floor: "FL", room: "RM", facility: "FAC", equipment: "EQ", property: "P" };

export async function loadBatch(db: Db, o: LoadOptions): Promise<LoadResult> {
  const log = o.log ?? (() => {});
  const progress = o.onProgress ?? (() => {});
  const property = o.propertyId ? await findPropertyById(db, o.propertyId) : await findProperty(db, o.propertyCode);
  if (!property) throw new Error("property not seeded");
  const tz = property.timezone;
  const tenant = { groupId: property.groupId, propertyId: property.id };
  const result: LoadResult = { sources: {}, rejected: {}, locations: { created: 0, links: 0 }, stayKeys: 0, occupancy: 0, skipped: [] };
  const reject = (source: string, reason: string) => {
    const r = (result.rejected![source] ??= {});
    r[reason] = (r[reason] ?? 0) + 1;
  };

  progress("reading the files");
  const { files } = await readExportFolder(o.dir);
  // The mapping was derived from the files the check saw; a renamed column or a swapped file must stop the load, not empty it.
  const problems = validateMapping(o.mapping, files);
  if (problems.length) throw new Error(`the mapping no longer fits the files: ${problems.join("; ")}`);
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
    let existing = locationRows.find((l) => l.code.toUpperCase() === row.code.toUpperCase());
    if (existing && existing.kind !== row.kind) {
      // "SPA" the facility and "SPA" the equipment are two places
      row = { ...row, code: `${row.code}-${KIND_SUFFIX[row.kind]}` };
      existing = locationRows.find((l) => l.code.toUpperCase() === row.code.toUpperCase());
    }
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

  /** A code for a place named in the export: the slug, or the slug plus a hash when another place already took it. */
  const codeFor = (text: string, name: string): string => {
    const base = slugCode(text);
    const taken = locationRows.find((l) => l.code.toUpperCase() === base);
    if (!taken || taken.name.trim().toLowerCase() === name.trim().toLowerCase()) return base;
    return `${base.slice(0, 19)}-${hash4(name)}`;
  };

  const buildingFor = async (text: string | undefined, name?: string): Promise<{ id: string; code: string } | null> => {
    if (!text?.trim()) return null;
    const hit = resolver.resolve(text);
    const found = hit ? locationRows.find((l) => l.id === hit.id) : undefined;
    if (found?.kind === "building") return { id: found.id, code: found.code };
    const def: BuildingDef = { code: codeFor(text, (name ?? text).trim()), name: (name ?? text).trim(), floors: [] };
    const code = def.code;
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
    const monthFirstFor = (field?: string) => (m.monthFirstFields && field ? m.monthFirstFields.includes(field) : m.monthFirst);
    const date = (v: string | undefined, field?: string, time?: string) => parseDate(v, time, monthFirstFor(field), tz);
    progress(`${m.dataset}: ${recs.length} rows`);
    log(`${m.path} → ${m.dataset}: ${recs.length} rows`);

    switch (m.dataset) {
      case "rooms": {
        // The same room number in two buildings (A-101 and B-101) must stay two places.
        const buildingsOf = new Map<string, Set<string>>();
        for (const { rec } of recs) {
          const c = (rec.room_code ?? "").trim().toUpperCase();
          if (c) (buildingsOf.get(c) ?? buildingsOf.set(c, new Set()).get(c)!).add((rec.building || rec.building_name || "").trim().toUpperCase());
        }
        const prefixRooms = [...buildingsOf.values()].some((b) => b.size > 1);
        if (prefixRooms) log("rooms: the same number appears in several buildings; room codes are prefixed with the building");
        for (const { rec } of recs) {
          const rawCode = (rec.room_code ?? "").trim();
          if (!rawCode) continue;
          const building = await buildingFor(rec.building || rec.building_name, rec.building_name);
          let parentId = building?.id ?? root.id;
          const floorNum = rec.floor !== undefined && rec.floor !== "" && Number.isFinite(Number(rec.floor)) ? Number(rec.floor) : null;
          const code = prefixRooms && building ? `${building.code}-${rawCode}` : rawCode;
          const isVilla = /^(y|yes|true|1|villa|bungalow)$/i.test(rec.is_villa ?? "");
          // villas sit under their building; only hotel rooms get a floor level
          if (building && floorNum !== null && !isVilla) {
            const def: BuildingDef = { code: building.code, name: rec.building_name || rec.building || building.code, floors: [floorNum] };
            const f = await upsert({ kind: "floor", code: floorCode(building.code, floorNum), name: `${def.name} floor ${floorNum}`, parentId: building.id, aliases: floorAliases(def, floorNum), attributes: { floor: floorNum } });
            parentId = f.id;
          }
          const roomRow = { roomCode: rawCode, building: building?.code ?? "", buildingName: rec.building_name ?? rec.building ?? "", floor: rec.floor ?? "", roomType: rec.room_type ?? "", view: rec.view ?? "", isVilla };
          await upsert({ kind: "room", code, name: isVilla ? `Villa ${rawCode.replace(/^V/i, "")}` : `Room ${rawCode}`, parentId, aliases: [...roomAliases(roomRow), ...(prefixRooms && building ? [code, `${building.code} ${rawCode}`] : [])], attributes: { building: building?.code ?? null, floor: floorNum, room_type: rec.room_type ?? null, view: rec.view ?? null, is_villa: isVilla } });
        }
        resolver = new LocationResolver(locationRows);
        break;
      }
      case "facilities": {
        for (const { rec } of recs) {
          const name = (rec.name ?? "").trim();
          if (!name) continue;
          const code = (rec.code ?? "").trim().toUpperCase() || codeFor(name, name);
          const f = { code, name, type: rec.type ?? "", area: rec.area ?? "", notes: rec.notes ?? "" };
          await upsert({ kind: "facility", code, name, parentId: root.id, aliases: facilityAliases(f), attributes: { type: f.type, area: f.area, notes: f.notes } });
        }
        resolver = new LocationResolver(locationRows);
        break;
      }
      case "equipment": {
        const known = knownPlaces(locationRows);
        for (const { rec } of recs) {
          const name = (rec.name ?? "").trim();
          if (!name) continue;
          const id = (rec.id ?? "").trim().toUpperCase() || codeFor(name, name);
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
          const arrival = date(rec.arrival, "arrival");
          if (!rec.stay_key || !arrival) {
            reject("pms", !rec.stay_key ? "no stay key" : "no usable date");
            continue;
          }
          rows.push({
            ...tenant,
            source: "pms",
            // The reservation number lives in pii.stay_keys only; here the stay is its pseudonym.
            externalId: stayRef(property.code, rec.stay_key),
            occurredAt: arrival,
            stayRef: stayRef(property.code, rec.stay_key),
            raw,
            mapped: { room: rec.room ?? null, arrival: arrival.toISOString(), departure: date(rec.departure, "departure")?.toISOString() ?? null, adults: rec.adults ?? null, children: rec.children ?? null, segment: rec.segment ?? null, board: rec.board ?? null },
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
          const created = date(rec.created_at, "created_at");
          if (!created) {
            reject("work_order", "no usable date");
            continue;
          }
          const id = (rec.id ?? "").trim() || stableKey([rec.created_at, rec.location, rec.description], raw);
          rows.push({
            ...tenant,
            source: "work_order",
            externalId: id,
            occurredAt: created,
            textOriginal: rec.description || null,
            category: rec.category || null,
            stayRef: rec.stay_key ? stayRef(property.code, rec.stay_key) : null,
            raw,
            mapped: { id, created_at: created.toISOString(), closed_at: date(rec.closed_at, "closed_at")?.toISOString() ?? null, status: rec.status ?? null, location: rec.location ?? null, category: rec.category ?? null, description: rec.description ?? null, closure_note: rec.closure_note ?? null, assigned_to: rec.assigned_to ? staffRef(property.code, rec.assigned_to) : null, priority: rec.priority ?? null, reopened: rec.reopened ?? null, created_by: rec.created_by ?? null, reported_via: rec.reported_via ?? null, asset_id: rec.asset_id ?? null },
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
          const at = date(rec.occurred_at, "occurred_at", rec.time);
          if (!at) {
            reject("front_desk", "no usable date");
            continue;
          }
          const id = (rec.id ?? "").trim() || stableKey([rec.occurred_at, rec.time, rec.room, rec.description], raw);
          rows.push({
            ...tenant,
            source: "front_desk",
            externalId: id,
            occurredAt: at,
            textOriginal: rec.description || null,
            stayRef: rec.stay_key ? stayRef(property.code, rec.stay_key) : null,
            raw,
            mapped: { id, occurred_at: at.toISOString(), room: rec.room ?? null, category: rec.category ?? null, description: rec.description ?? null, resolution: rec.resolution ?? null, agent_note: rec.agent_note ?? null, department: rec.department ?? null, resolved_at: date(rec.resolved_at, "resolved_at")?.toISOString() ?? null, work_order_id: rec.work_order_id ?? null, severity: rec.severity ?? null, channel: rec.channel ?? null, shift: rec.shift ?? null },
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
          const at = date(rec.date, "date");
          if (!at) {
            reject("compensation", "no usable date");
            continue;
          }
          rows.push({
            ...tenant,
            source: "compensation",
            externalId: stableKey([rec.date, rec.room, rec.reason, rec.type, rec.value], raw),
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
          const at = date(rec.submitted_at, "submitted_at") ?? date(rec.departure_date, "departure_date");
          if (!at) {
            reject("survey", "no usable date");
            continue;
          }
          const id = (rec.id ?? "").trim() || stableKey([rec.submitted_at ?? rec.departure_date, rec.stay_key, rec.overall, rec.comment], raw);
          rows.push({
            ...tenant,
            source: "survey",
            externalId: id,
            occurredAt: at,
            language: rec.language?.trim().toLowerCase().slice(0, 7) || null,
            textOriginal: rec.comment || null,
            stayRef: rec.stay_key ? stayRef(property.code, rec.stay_key) : null,
            raw,
            mapped: { id, submitted_at: at.toISOString(), room: rec.room ?? null, overall: rec.overall ?? null, nps: rec.nps ?? null, would_recommend: rec.would_recommend ?? null, comment: rec.comment ?? null, language: rec.language ?? null, building: rec.building ?? null, room_type: rec.room_type ?? null },
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
          const at = date(firstOf(rec.review_date), "review_date");
          const text = rec.text || rec.title;
          if (!at || !text) {
            reject("review", !at ? "no usable date" : "no text");
            continue;
          }
          const id = (rec.id ?? "").trim() || stableKey([rec.platform, firstOf(rec.review_date), rec.title, text], raw);
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
    // Only a string that names its own zone may take the runtime's parser; a naive one would land in the server's zone.
    if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(value.trim())) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const parts = time ? withTime(hit.parts, time) : hit.parts;
  return zonedToUtc({ year: parts.year, month: parts.month, day: parts.monthOnly ? 1 : parts.day, hour: parts.hour, minute: parts.minute }, tz);
}

function firstOf(v: string | undefined): string | undefined {
  return v?.split(" / ")[0];
}



export type { ParsedFile, FileMapping };
