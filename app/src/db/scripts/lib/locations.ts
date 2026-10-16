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

/**
 * Parse the free-text `serves` column of equipment.csv into location codes.
 * "all rooms in C, Elia kitchen" → ["C", "REST-ELIA"]. Unresolved tokens are
 * returned so the loader can record them instead of silently dropping them.
 */
export function parseServes(
  serves: string,
  known: { buildings: Set<string>; facilities: Map<string, string> },
): { codes: string[]; unresolved: string[] } {
  const codes = new Set<string>();
  const unresolved: string[] = [];
  for (const rawToken of serves.split(",")) {
    const token = rawToken.trim();
    if (!token) continue;
    const t = token.toLowerCase();
    if (known.facilities.has(token)) {
      codes.add(known.facilities.get(token)!);
      continue;
    }
    let m = /^all rooms in ([a-z])$/i.exec(token);
    if (m && known.buildings.has(m[1].toUpperCase())) {
      codes.add(m[1].toUpperCase());
      continue;
    }
    m = /^floors? [\d-]+ ([a-z])\b/i.exec(token);
    if (m && known.buildings.has(m[1].toUpperCase())) {
      codes.add(m[1].toUpperCase());
      if (/elia/i.test(token)) codes.add("REST-ELIA");
      if (/infinity pool/i.test(token)) codes.add("POOL-INFINITY");
      continue;
    }
    if (/all guest-room locks/i.test(t)) {
      // Serves every room: link to every building.
      for (const b of known.buildings) codes.add(b);
      continue;
    }
    const byKeyword: [RegExp, string][] = [
      [/orizontas/, "REST-ORIZONTAS"],
      [/ammos/, "REST-AMMOS"],
      [/elia/, "REST-ELIA"],
      [/lobby/, "LOBBY"],
      [/\bspa\b/, "SPA"],
      [/\bgym\b/, "GYM"],
      [/infinity pool/, "POOL-INFINITY"],
      [/main pool/, "POOL-MAIN"],
      [/beach ?bar|kyma/, "BEACHBAR"],
      [/kids/, "KIDS"],
      [/parking/, "PARKING"],
    ];
    const hit = byKeyword.find(([re]) => re.test(t));
    if (hit && known.facilities.has(hit[1])) {
      codes.add(hit[1]);
      continue;
    }
    unresolved.push(token);
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
