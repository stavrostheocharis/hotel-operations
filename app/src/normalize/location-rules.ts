import {
  LocationResolver,
  normalizeLocationText,
} from "@/db/scripts/lib/locations";
import { U } from "./regex";

/**
 * Rule-based location inference, applied after the exact/alias match fails.
 * Works on the typed location field first, then on the free text. Returns a
 * location *code*; the pipeline maps codes to ids. Everything here is a
 * deterministic regex, so a hit can always be explained.
 */

export type LocationRow = {
  id: string;
  code: string;
  kind: "property" | "building" | "floor" | "room" | "facility" | "equipment";
  aliases: string[];
  attributes: Record<string, unknown>;
};

export type LocationHit = {
  code: string;
  method: "exact" | "alias" | "inferred";
  confidence: number;
  rule: string;
};

export class LocationIndex {
  readonly resolver: LocationResolver;
  readonly byCode = new Map<string, LocationRow>();
  readonly rooms = new Set<string>();
  readonly buildings = new Set<string>();
  readonly facilities = new Set<string>();
  readonly equipment = new Set<string>();
  readonly floors = new Set<string>();

  constructor(rows: LocationRow[]) {
    this.resolver = new LocationResolver(rows);
    for (const r of rows) {
      this.byCode.set(r.code.toUpperCase(), r);
      if (r.kind === "room") this.rooms.add(r.code.toUpperCase());
      else if (r.kind === "building") this.buildings.add(r.code.toUpperCase());
      else if (r.kind === "facility") this.facilities.add(r.code.toUpperCase());
      else if (r.kind === "equipment") this.equipment.add(r.code.toUpperCase());
      else if (r.kind === "floor") this.floors.add(r.code.toUpperCase());
    }
  }

  has(code: string): boolean {
    return this.byCode.has(code.toUpperCase());
  }

  idOf(code: string): string | undefined {
    return this.byCode.get(code.toUpperCase())?.id;
  }

  /**
   * What kind of equipment this is, lower-cased: the `type` the export gave
   * it, else the words of its code and name ("C-BOILER" → "c boiler"), so a
   * place added by hand in Settings without a type still counts.
   */
  typeOf(code: string): string | null {
    const r = this.byCode.get(code.toUpperCase());
    if (!r || r.kind !== "equipment") return null;
    const t = r.attributes?.type;
    if (typeof t === "string" && t.trim()) return t.toLowerCase();
    return `${r.code} ${(r as { name?: string }).name ?? ""}`.toLowerCase().replace(/[-_]+/g, " ");
  }

  /** Equipment in a building whose type matches one of `types` (substring, e.g. "pump" matches "water_pump"), by code. */
  equipmentIn(building: string, types: readonly string[]): string[] {
    if (!types.length) return [];
    const b = building.toUpperCase();
    return [...this.byCode.values()]
      .filter((r) => r.kind === "equipment" && (String(r.attributes?.building ?? "").toUpperCase() === b || r.code.toUpperCase().startsWith(`${b}-`)))
      .filter((r) => this.isEquipmentOfType(r.code, types))
      .map((r) => r.code.toUpperCase())
      .sort();
  }

  /** Whether the equipment at `code` is the kind of shared plant `types` names. */
  isEquipmentOfType(code: string, types: readonly string[]): boolean {
    const t = this.typeOf(code);
    return t !== null && types.some((x) => t.includes(x));
  }
}

const WING_NAMES: [RegExp, string][] = [
  [/\b(main (building|bldg|block)|κεντρικ[όο]|kentriko|hauptgebäude|bâtiment principal|edificio principale)\b/iu, "A"],
  [/\b(garden (wing|block|building)|κήπος|κηπος|kipos|gartenflügel|aile jardin|ala giardino)\b/iu, "B"],
  [/\b(sea (wing|block|building)|θάλασσα|thalassa|meerflügel|aile mer|ala mare)\b/iu, "C"],
  [/\b(cliff (wing|block|building)|βράχος|vraxos|klippenflügel|aile falaise|ala scogliera)\b/iu, "D"],
];

const BUILDING_LETTER = U(/\b(?:bldg|building|block|wing|κτίριο|ktirio|kt\.?)\s*[-:]?\s*([a-d])\b/iu);
const LETTER_FIRST = U(/\b([a-d])\s*(?:boiler|chiller|lift|pump|roof|plant|wing|block|core|basement)\b/iu);
// Make every keyword pattern Unicode-aware (see ./regex).
for (const entry of WING_NAMES) entry[0] = U(entry[0]);

function buildingFrom(text: string, index: LocationIndex): string | null {
  for (const [re, code] of WING_NAMES) if (re.test(text) && index.buildings.has(code)) return code;
  const m = BUILDING_LETTER.exec(text) ?? LETTER_FIRST.exec(text);
  if (m) {
    const code = m[1].toUpperCase();
    if (index.buildings.has(code)) return code;
  }
  if (/\b(villas?|βίλες|βίλα|vila|vilas)\b/iu.test(text) && index.buildings.has("V")) return "V";
  return null;
}

type EquipmentRule = { re: RegExp; code: (b: string | null, text: string) => string | null; rule: string };

const EQUIPMENT_RULES: EquipmentRule[] = [
  { rule: "lock-server", re: /\b(lock[- ]?server|key[- ]?card (encoder|server)|door[- ]?lock (server|system)|encoder)\b/iu, code: () => "LOCKS-CONTROLLER" },
  { rule: "heat-pump", re: /\bheat ?pump|αντλία θερμότητας|wärmepumpe|pompe à chaleur|pompa di calore\b/iu, code: () => "POOLINF-HEATPUMP" },
  { rule: "pool-plant", re: /\b(pool (plant|filter|filtration|pump|dosing)|filtration|sand filter|άμμος φίλτρ|φίλτρ\w* πισίν)/iu, code: (_b, t) => (/infinity|adults/iu.test(t) ? "POOLINF-HEATPUMP" : "POOLMAIN-FILTER") },
  { rule: "steam-generator", re: /\b(steam generator|steam gen|hammam|hamam|sauna heater|χαμάμ|ατμογεννήτρ|dampfgenerator)\b/iu, code: () => "SPA-HEATER" },
  { rule: "beachbar-cold", re: /\b(ice machine|ice maker|cold room|παγομηχαν|ψυγείο μπαρ|eismaschine|machine à glaçons|macchina del ghiaccio)\b/iu, code: () => "BEACHBAR-COLD" },
  { rule: "beachbar-pa", re: /\b(sound system|loud ?speakers?|pa system|ηχοσύστημ\w*|ηχεία|lautsprecher\w*|impianto audio|sonorisation)\b/iu, code: () => "BEACHBAR-PA" },
  { rule: "grease-trap", re: /\b(grease trap|λιποσυλλέκτ|fettabscheider|bac à graisse)\b/iu, code: () => "AMMOS-GREASETRAP" },
  { rule: "elia-ac", re: /\belia\b.*\b(split|a\/?c|ac|aircon|κλιματ)|\b(split|a\/?c|ac|aircon|κλιματ)\w*\b.*\belia\b/iu, code: () => "ELIA-AC" },
  { rule: "boiler", re: /\b(boiler|boiler room|λεβητοστάσιο|λέβητ\w*|levitas|levitostasio|hot[- ]water (plant|tank|system)|kessel|chaudière|caldaia)\b/iu, code: (b) => (b ? `${b}-BOILER` : null) },
  { rule: "chiller", re: /\b(chiller|ψύκτ\w*|psyktis|kaltwassersatz|refroidisseur|condenser|κεντρικ\w* κλιματ\w*|central (ac|a\/c|air ?con))\b/iu, code: (b) => (b ? `${b}-CHILLER` : null) },
  { rule: "pump", re: /\b(booster|pump set|pump station|πιεστικ\w*|piestiko|water pump|druckerhöhung|surpresseur|autoclave)\b/iu, code: (b) => (b ? `${b}-PUMP` : null) },
  { rule: "lift", re: /\b(lift|elevator|ασανσέρ|ανελκυστήρ\w*|asanser|aufzug|fahrstuhl|ascenseur|ascensore|лифт|מעלית)\b/iu, code: (b, t) => {
    const building = b ?? (/\b(lobby|reception|ρεσεψιόν|υποδοχή)\b/iu.test(t) ? "A" : null);
    if (!building) return null;
    return `${building}-LIFT-${building === "A" && /garden/iu.test(t) ? 2 : 1}`;
  } },
];

const FACILITY_RULES: [RegExp, string][] = [
  [/\b(infinity|adults?[- ]only|υπερχείλ|απέραντ)\w*\b.*\b(pool|πισίν|piscine|piscina|pool)|\b(pool|πισίν\w*)\b.*\b(infinity|adults?[- ]only)/iu, "POOL-INFINITY"],
  [/\b(main|lagoon|central|κεντρικ\w*|κύρια)\b.*\b(pool|πισίν\w*|piscine|piscina)|\b(pool|πισίν\w*|piscine|piscina)\b.*\b(main|lagoon|κεντρικ\w*)/iu, "POOL-MAIN"],
  [/\b(spa|thalassa spa|hammam|hamam|sauna|χαμάμ|σάουνα|σπα|treatment room|massage|wellness)\b/iu, "SPA"],
  [/\b(gym|fitness|treadmill|γυμναστήρ\w*|laufband|salle de sport|palestra|тренажер|חדר כושר)\b/iu, "GYM"],
  [/\b(orizontas|breakfast|buffet|πρωιν\w*|frühstück|petit[- ]déjeuner|colazione|завтрак|ארוחת בוקר)\b/iu, "REST-ORIZONTAS"],
  [/\b(ammos|taverna|beach (restaurant|taverna)|ταβέρν\w*|άμμος)\b/iu, "REST-AMMOS"],
  [/\b(elia|fine dining|rooftop restaurant|ελιά)\b/iu, "REST-ELIA"],
  [/\b(kyma|beach ?bar|κύμα|μπαρ παραλίας|bar de plage|bar della spiaggia|beach club|dj)\b/iu, "BEACHBAR"],
  [/\b(lobby|reception|front desk|ρεσεψιόν|υποδοχή|rezeption|réception|accettazione|стойк|קבלה)\b/iu, "LOBBY"],
  [/\b(kids ?club|παιδότοπ\w*|kinderclub|club enfants|miniclub)\b/iu, "KIDS"],
  [/\b(parking|car park|πάρκινγκ|parkplatz|stationnement|parcheggio)\b/iu, "PARKING"],
  [/\b(pool|πισίν\w*|piscine|piscina|schwimmbad|бассейн|בריכה)\b/iu, "POOL-MAIN"],
];

for (const rule of EQUIPMENT_RULES) rule.re = U(rule.re);
for (const entry of FACILITY_RULES) entry[0] = U(entry[0]);

const ROOM_NUMBER = /(?<![\d.,])([1-3]\d{2})(?![\d])/g;
const VILLA = U(/\b(?:villa|vila|villa|v|βίλα|vila|βιλα)\s*[-.]?\s*0?(\d{1,2})\b/iu);
const FLOOR = U(/\b(?:(\d)(?:st|nd|rd|th)?\s*(?:floor|όροφ\w*|stock|étage|piano)|(?:floor|όροφ\w*|or\.)\s*(\d))\b/iu);

/**
 * Try, in order: exact/alias on the typed field, equipment keywords, villa,
 * room number, facility keywords, floor, building.
 */
export function inferLocation(
  typed: string | null | undefined,
  freeText: string | null | undefined,
  index: LocationIndex,
): LocationHit | null {
  const typedText = (typed ?? "").trim();
  if (typedText) {
    const direct = index.resolver.resolve(typedText);
    if (direct) {
      const row = [...index.byCode.values()].find((r) => r.id === direct.id);
      if (row) {
        return {
          code: row.code,
          method: direct.method,
          confidence: direct.method === "exact" ? 1 : 0.95,
          rule: direct.method,
        };
      }
    }
  }
  // Both the typed field and the free text can carry the place; keep the most
  // specific hit ("Bldg D roof terrace" + "heat pump filter" → the heat pump,
  // not the building), and on equal specificity the typed field.
  const hits: LocationHit[] = [];
  if (typedText) {
    const h = inferFromText(typedText, index, "typed");
    if (h) hits.push(h);
  }
  const free = (freeText ?? "").trim();
  if (free) {
    const h = inferFromText(free, index, "text");
    if (h) hits.push(h);
  }
  if (!hits.length) return null;
  hits.sort((a, b) => specificity(b, index) - specificity(a, index) || b.confidence - a.confidence);
  return hits[0];
}

function specificity(hit: LocationHit, index: LocationIndex): number {
  const code = hit.code.toUpperCase();
  if (index.rooms.has(code) || index.equipment.has(code)) return 4;
  if (index.facilities.has(code)) return 3;
  if (index.floors.has(code)) return 2;
  return 1;
}

function inferFromText(text: string, index: LocationIndex, where: "typed" | "text"): LocationHit | null {
  const norm = normalizeLocationText(text);
  const penalty = where === "text" ? 0.1 : 0;
  const building = buildingFrom(norm, index);

  for (const eq of EQUIPMENT_RULES) {
    if (!eq.re.test(norm)) continue;
    const code = eq.code(building, norm);
    if (code && index.equipment.has(code)) {
      return { code, method: "inferred", confidence: 0.85 - penalty, rule: `equipment:${eq.rule}` };
    }
  }

  const villa = VILLA.exec(norm);
  if (villa) {
    const code = `V${villa[1].padStart(2, "0")}`;
    if (index.rooms.has(code)) {
      return { code, method: "inferred", confidence: 0.9 - penalty, rule: "villa" };
    }
  }

  const rooms = [...norm.matchAll(ROOM_NUMBER)].map((m) => m[1]).filter((r) => index.rooms.has(r));
  if (rooms.length) {
    const unique = [...new Set(rooms)];
    return {
      code: unique[0],
      method: "inferred",
      confidence: (unique.length === 1 ? 0.9 : 0.75) - penalty,
      rule: unique.length === 1 ? "room-number" : "room-number:first-of-several",
    };
  }

  for (const [re, code] of FACILITY_RULES) {
    if (re.test(norm) && index.facilities.has(code)) {
      return { code, method: "inferred", confidence: 0.8 - penalty, rule: `facility:${code}` };
    }
  }

  const floor = FLOOR.exec(norm);
  if (floor && building) {
    const n = floor[1] ?? floor[2];
    const code = `${building}/${n}`;
    if (index.floors.has(code)) {
      return { code, method: "inferred", confidence: 0.8 - penalty, rule: "floor" };
    }
    if (n === "0") {
      return { code: building, method: "inferred", confidence: 0.7 - penalty, rule: "ground-floor→building" };
    }
  }

  if (building) {
    return { code: building, method: "inferred", confidence: 0.7 - penalty, rule: "building" };
  }
  return null;
}
