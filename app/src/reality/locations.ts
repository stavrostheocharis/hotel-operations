import type { EquipmentRow, FacilityRow, RoomRow } from "@/db/scripts/lib/data-files";
import {
  buildingAliases,
  equipmentAliases,
  facilityAliases,
  floorAliases,
  floorCode,
  roomAliases,
  type BuildingDef,
} from "@/db/scripts/lib/locations";
import { inferLocation, LocationIndex, type LocationRow } from "@/normalize/location-rules";

/**
 * The master list (dataset 8 of the data request) as an in-memory index,
 * built from whatever room, facility and equipment tables the folder holds.
 * Resolution reuses the alias generator of the seed and the documented
 * regex rules of the normalisation step, so "resolves" means the same thing
 * here as it will in the audit: exact, alias, or an explainable rule.
 */

export type Rec = Record<string, string>;

export type MasterCounts = {
  rooms: number;
  villas: number;
  buildings: number;
  floors: number;
  facilities: number;
  equipment: number;
  equipmentWithServes: number;
};

export type Master = {
  index: LocationIndex | null;
  counts: MasterCounts;
  roomCodes: Set<string>;
};

function truthy(v: string | undefined): boolean {
  return /^(true|1|yes|y|ναι|x|✓)$/i.test((v ?? "").trim());
}

export function buildMaster(rooms: Rec[], facilities: Rec[], equipment: Rec[]): Master {
  const rows: LocationRow[] = [];
  const counts: MasterCounts = { rooms: 0, villas: 0, buildings: 0, floors: 0, facilities: 0, equipment: 0, equipmentWithServes: 0 };
  const roomCodes = new Set<string>();
  const seen = new Set<string>();
  const add = (row: LocationRow) => {
    const key = row.code.toUpperCase();
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ ...row, id: key });
  };

  const buildings = new Map<string, BuildingDef>();
  const roomRows: RoomRow[] = [];
  for (const r of rooms) {
    const code = (r.room_code ?? "").trim();
    if (!code) continue;
    const building = (r.building ?? "").trim();
    const isVilla = truthy(r.is_villa) || /^v\s*\d+$/i.test(code) || /villa|βίλα|bungalow/i.test(`${r.room_type ?? ""} ${building}`);
    const floor = (r.floor ?? "").trim();
    roomRows.push({ roomCode: code, building, buildingName: (r.building_name ?? "").trim() || building, floor, roomType: (r.room_type ?? "").trim(), view: (r.view ?? "").trim(), isVilla });
    if (building) {
      const def = buildings.get(building) ?? { code: building, name: (r.building_name ?? "").trim() || `Building ${building}`, floors: [] };
      const f = Number(floor);
      if (floor && Number.isInteger(f) && !def.floors.includes(f)) def.floors.push(f);
      buildings.set(building, def);
    }
  }
  for (const def of buildings.values()) {
    add({ id: def.code, code: def.code, kind: "building", aliases: buildingAliases(def), attributes: {} });
    counts.buildings++;
    for (const f of def.floors.sort((a, b) => a - b)) {
      if (f === 0) continue;
      add({ id: floorCode(def.code, f), code: floorCode(def.code, f), kind: "floor", aliases: floorAliases(def, f), attributes: { floor: f } });
      counts.floors++;
    }
  }
  for (const room of roomRows) {
    add({ id: room.roomCode, code: room.roomCode, kind: "room", aliases: roomAliases(room), attributes: { building: room.building, is_villa: room.isVilla } });
    roomCodes.add(room.roomCode.toUpperCase());
    counts.rooms++;
    if (room.isVilla) counts.villas++;
  }
  for (const f of facilities) {
    const code = (f.code ?? "").trim() || (f.name ?? "").trim().toUpperCase().replace(/\s+/g, "-");
    if (!code) continue;
    const row: FacilityRow = { code, name: (f.name ?? "").trim(), type: (f.type ?? "").trim(), area: (f.area ?? "").trim(), notes: (f.notes ?? "").trim() };
    add({ id: code, code, kind: "facility", aliases: facilityAliases(row), attributes: { type: row.type } });
    counts.facilities++;
  }
  for (const e of equipment) {
    const id = (e.id ?? "").trim() || (e.name ?? "").trim().toUpperCase().replace(/\s+/g, "-");
    if (!id) continue;
    const row: EquipmentRow = { id, name: (e.name ?? "").trim(), type: (e.type ?? "").trim(), building: (e.building ?? "").trim(), locationText: (e.location ?? "").trim(), serves: (e.serves ?? "").trim(), installedYear: (e.installed_year ?? "").trim() };
    add({ id, code: id, kind: "equipment", aliases: equipmentAliases(row), attributes: { type: row.type, building: row.building } });
    counts.equipment++;
    if (row.serves) counts.equipmentWithServes++;
  }
  return { index: rows.length ? new LocationIndex(rows) : null, counts, roomCodes };
}

export type Resolution = {
  code: string;
  kind: "building" | "floor" | "room" | "facility" | "equipment" | "property";
  /** "exact" / "alias" as typed; "rule" through a documented regex. */
  method: "exact" | "alias" | "rule";
};

export function resolveTyped(text: string, master: Master): Resolution | null {
  if (!master.index) return null;
  const t = text.trim();
  if (!t) return null;
  const hit = inferLocation(t, null, master.index);
  if (!hit) return null;
  const row = master.index.byCode.get(hit.code.toUpperCase());
  if (!row) return null;
  return { code: row.code, kind: row.kind, method: hit.method === "inferred" ? "rule" : hit.method };
}

const ROOM_TOKEN = /(?<![\d.,])(\d{3,4})(?![\d])/;
const VILLA_TOKEN = /\b(?:villa|vila|v|βίλα|βιλα|bungalow)\s*[-.]?\s*0?(\d{1,2})\b/iu;

/**
 * The room a location string names, by its digits alone, with no list
 * involved: used to ask "do the rooms technicians type exist in the list?".
 */
export function roomToken(text: string): string | null {
  const t = text.trim();
  const v = VILLA_TOKEN.exec(t);
  if (v) return `V${v[1].padStart(2, "0")}`;
  const m = ROOM_TOKEN.exec(t);
  return m ? m[1] : null;
}

export function roomExists(token: string, master: Master): boolean {
  const k = token.toUpperCase();
  if (master.roomCodes.has(k)) return true;
  // Villas listed as "V7" when the token says "V07", or vice versa.
  const n = /^V0*(\d+)$/.exec(k);
  if (n) return master.roomCodes.has(`V${n[1]}`) || master.roomCodes.has(`V${n[1].padStart(2, "0")}`);
  return false;
}
