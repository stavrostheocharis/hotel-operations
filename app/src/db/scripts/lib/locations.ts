import type { EquipmentRow, FacilityRow, RoomRow } from "./data-files";

/** Lower-case, trimmed, single-spaced: the key used for exact/alias matching. */
export function normalizeLocationText(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

export type BuildingDef = {
  code: string;
  name: string;
  greekName?: string;
  marketingName?: string;
  floors: number[];
};

export function buildingAliases(b: BuildingDef): string[] {
  return dedupe([
    b.name,
    b.marketingName ?? "",
    b.greekName ?? "",
    `Bldg ${b.code}`,
    `Building ${b.code}`,
    `Block ${b.code}`,
    `Wing ${b.code}`,
    `Κτίριο ${b.code}`,
  ]);
}

export function floorCode(building: string, floor: number | string): string {
  return `${building}/${floor}`;
}

export function floorAliases(b: BuildingDef, floor: number): string[] {
  return dedupe([
    `${b.name} floor ${floor}`,
    `${b.name} ${ordinal(floor)} floor`,
    `floor ${floor} ${b.code}`,
    `${b.code} floor ${floor}`,
    `${ordinal(floor)} floor ${b.name}`,
  ]);
}

/** The spellings technicians and agents actually type for a room. */
export function roomAliases(room: RoomRow): string[] {
  const code = room.roomCode;
  if (room.isVilla || /^V\d+$/i.test(code)) {
    const n = Number(code.replace(/^V/i, ""));
    const two = String(n).padStart(2, "0");
    return dedupe([
      `Villa ${n}`,
      `Villa ${two}`,
      `V${n}`,
      `V${two}`,
      `V ${n}`,
      `V ${two}`,
      `V-${n}`,
      `V-${two}`,
      `vila ${n}`,
      `Βίλα ${n}`,
      `Βίλα ${two}`,
    ]);
  }
  return dedupe([
    `Rm ${code}`,
    `Rm. ${code}`,
    `Room ${code}`,
    `#${code}`,
    `${room.building}-${code}`,
    `${room.building} ${code}`,
    `${code} (${room.buildingName})`,
    `${code} ${room.buildingName}`,
    `Δωμ. ${code}`,
    `Δωμ ${code}`,
    `Δωμάτιο ${code}`,
    `dwm ${code}`,
    `dom ${code}`,
  ]);
}

export function facilityAliases(f: FacilityRow): string[] {
  return dedupe([f.name, f.code.replace(/-/g, " ")]);
}

export function equipmentAliases(e: EquipmentRow): string[] {
  const out = [e.name, e.locationText, e.id.replace(/-/g, " ")];
  if (e.building) {
    const kind = e.type.toLowerCase();
    if (kind === "boiler") {
      out.push(
        `${e.building} boiler`,
        `Bldg ${e.building} boiler`,
        `Bldg ${e.building} boiler room`,
        `Boiler ${e.building}`,
        `Λεβητοστάσιο ${e.building}`,
        `Λέβητας ${e.building}`,
      );
    } else if (kind === "chiller") {
      out.push(
        `${e.building} chiller`,
        `Bldg ${e.building} chiller`,
        `Chiller ${e.building}`,
        `Ψύκτης ${e.building}`,
      );
    } else if (kind === "elevator") {
      out.push(`${e.building} lift`, `Lift ${e.building}`, `Ασανσέρ ${e.building}`);
    } else if (kind === "water_pump") {
      out.push(`${e.building} pump`, `${e.building} booster pump`, `Πιεστικό ${e.building}`);
    }
  }
  return dedupe(out);
}

/** Lower-cased phrases and words that name a building or a facility, each pointing at its code. */
export type KnownPlaces = { buildings: Map<string, string>; facilities: Map<string, string> };

const STOP_WORDS = new Set(["the", "and", "main", "guest", "guests", "pool", "bar", "club", "wing", "block", "building", "bldg", "area", "room", "rooms", "all", "fine", "dining", "studio", "beach", "κτίριο", "κτηριο", "πτέρυγα", "εστιατόριο", "πισίνα", "μπαρ", "δωμάτια"]);

/**
 * Index a property's buildings and facilities for the serves parser: the
 * code, the name, every alias, and each distinctive word of the name
 * ("Orizontas" for "Orizontas Restaurant"), all lower-cased.
 */
export function knownPlaces(rows: { kind: string; code: string; name: string; aliases?: string[] }[]): KnownPlaces {
  const known: KnownPlaces = { buildings: new Map(), facilities: new Map() };
  for (const r of rows) {
    const map = r.kind === "building" ? known.buildings : r.kind === "facility" ? known.facilities : null;
    if (!map) continue;
    const put = (key: string) => {
      const k = key.trim().toLowerCase();
      if (k && !map.has(k)) map.set(k, r.code);
    };
    put(r.code);
    put(r.code.replace(/-/g, " "));
    put(r.name);
    for (const a of r.aliases ?? []) put(a);
    for (const w of r.name.split(/[^\p{L}\p{N}]+/u)) if (w.length >= 4 && !STOP_WORDS.has(w.toLowerCase())) put(w);
  }
  return known;
}

const ALL_ROOMS = /^(?:all|every|όλα τα)\s+(?:guest[- ]?)?(?:rooms?|δωμάτια)(?:\s+(?:in|of|at|στο|στην|του|της)\s+(.+))?$/iu;
const BUILDING_PREFIX = /^(?:building|bldg|block|wing|κτίριο|κτηριο|πτέρυγα)\s+(.+)$/iu;
const FLOORS = /^floors?\s+[\d\s,–-]+\s*(?:of|in)?\s*(.+)$/iu;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function mentions(text: string, known: Map<string, string>): string[] {
  const keys = [...known.keys()].filter((k) => k.length >= 3).sort((a, b) => b.length - a.length);
  const out: string[] = [];
  for (const k of keys) {
    const code = known.get(k)!;
    if (out.includes(code)) continue;
    if (new RegExp(`(?:^|[^\\p{L}\\p{N}])${escape(k)}(?:$|[^\\p{L}\\p{N}])`, "iu").test(text)) out.push(code);
  }
  return out;
}

/**
 * Turn a "serves" cell ("all rooms in A, lobby, Orizontas kitchen") into
 * location codes using only what the property's own places are called.
 * Tokens nothing matches are returned so the loader can record them.
 */
export function parseServes(serves: string, known: KnownPlaces): { codes: string[]; unresolved: string[] } {
  const codes = new Set<string>();
  const unresolved: string[] = [];
  const building = (text: string): string | undefined => known.buildings.get(text.trim().toLowerCase()) ?? mentions(text, known.buildings)[0];
  for (const rawToken of serves.split(/[,;]|\s\+\s/)) {
    const token = rawToken.trim();
    if (!token) continue;
    const t = token.toLowerCase();
    const direct = known.facilities.get(t) ?? known.buildings.get(t);
    if (direct) {
      codes.add(direct);
      continue;
    }
    let m = ALL_ROOMS.exec(token);
    if (m) {
      if (!m[1]) for (const b of new Set(known.buildings.values())) codes.add(b);
      else {
        const b = building(m[1]);
        if (b) codes.add(b);
        else unresolved.push(token);
      }
      continue;
    }
    if (/^all guest-?room locks$/i.test(t)) {
      for (const b of new Set(known.buildings.values())) codes.add(b);
      continue;
    }
    m = BUILDING_PREFIX.exec(token) ?? FLOORS.exec(token);
    if (m) {
      const b = building(m[1]);
      if (b) codes.add(b);
      for (const f of mentions(token, known.facilities)) codes.add(f);
      if (!b && !mentions(token, known.facilities).length) unresolved.push(token);
      continue;
    }
    const hits = [...mentions(token, known.facilities), ...mentions(token, known.buildings)];
    if (hits.length) for (const h of hits) codes.add(h);
    else unresolved.push(token);
  }
  return { codes: [...codes], unresolved };
}

/**
 * In-memory index of a property's locations for exact and alias matching.
 * This is deliberately dumb: no fuzzy matching, no model. Anything it cannot
 * match stays unresolved for the normalisation step.
 */
export class LocationResolver {
  private byCode = new Map<string, string>();
  private byAlias = new Map<string, string>();

  constructor(
    rows: { id: string; code: string; aliases: string[] }[],
  ) {
    for (const r of rows) {
      this.byCode.set(normalizeLocationText(r.code), r.id);
      for (const a of r.aliases) {
        const key = normalizeLocationText(a);
        if (key && !this.byAlias.has(key)) this.byAlias.set(key, r.id);
      }
    }
  }

  resolve(text: string): { id: string; method: "exact" | "alias" } | null {
    const key = normalizeLocationText(text);
    if (!key) return null;
    const exact = this.byCode.get(key);
    if (exact) return { id: exact, method: "exact" };
    const alias = this.byAlias.get(key);
    if (alias) return { id: alias, method: "alias" };
    return null;
  }
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const t = v.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}
