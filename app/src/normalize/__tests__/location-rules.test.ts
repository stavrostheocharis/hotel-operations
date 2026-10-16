import { describe, expect, it } from "vitest";
import {
  buildingAliases,
  equipmentAliases,
  facilityAliases,
  roomAliases,
} from "@/db/scripts/lib/locations";
import { inferLocation, LocationIndex, type LocationRow } from "../location-rules";

function row(partial: Omit<LocationRow, "id" | "attributes"> & { attributes?: Record<string, unknown> }): LocationRow {
  return { id: `id-${partial.code}`, attributes: {}, ...partial };
}

const buildings = [
  { code: "A", name: "Main Building", greekName: "Κεντρικό", floors: [1, 2, 3] },
  { code: "B", name: "Garden Wing", greekName: "Κήπος", floors: [1, 2, 3] },
  { code: "C", name: "Sea Wing", greekName: "Θάλασσα", floors: [1, 2, 3] },
  { code: "D", name: "Cliff Wing", greekName: "Βράχος", floors: [1, 2] },
  { code: "V", name: "Villas", greekName: "Βίλες", floors: [] },
];

const rooms = ["312", "262", "132", "230", "274", "214"].map((code) => ({
  roomCode: code,
  building: code[1] === "3" ? "B" : code[1] === "6" ? "C" : "A",
  buildingName: code[1] === "3" ? "Garden Wing" : code[1] === "6" ? "Sea Wing" : "Main Building",
  floor: code[0],
  roomType: "Superior",
  view: "sea",
  isVilla: false,
}));
const villas = ["V05", "V12"].map((code) => ({
  roomCode: code, building: "V", buildingName: "Villas", floor: "0", roomType: "Villa", view: "sea", isVilla: true,
}));

const rows: LocationRow[] = [
  row({ code: "ASTRAEA", kind: "property", aliases: ["Astraea Bay"] }),
  ...buildings.map((b) => row({ code: b.code, kind: "building", aliases: buildingAliases(b) })),
  ...["A/1", "A/2", "A/3", "B/1", "B/2", "B/3", "C/1", "C/2", "C/3", "D/1", "D/2"].map((code) => row({ code, kind: "floor", aliases: [] })),
  ...[...rooms, ...villas].map((r) => row({ code: r.roomCode, kind: "room", aliases: roomAliases(r) })),
  ...[
    { code: "POOL-MAIN", name: "Main Pool" },
    { code: "POOL-INFINITY", name: "Infinity Pool (adults only)" },
    { code: "SPA", name: "Thalassa Spa" },
    { code: "GYM", name: "Fitness Studio" },
    { code: "REST-ORIZONTAS", name: "Orizontas Restaurant" },
    { code: "REST-AMMOS", name: "Ammos Beach Taverna" },
    { code: "REST-ELIA", name: "Elia Fine Dining" },
    { code: "BEACHBAR", name: "Kyma Beach Bar" },
    { code: "LOBBY", name: "Lobby & Reception" },
  ].map((f) => row({ code: f.code, kind: "facility", aliases: facilityAliases({ ...f, type: "x", area: "", notes: "" }) })),
  ...[
    { id: "C-BOILER", name: "Sea Wing hot-water boiler + circulation pumps", type: "boiler", building: "C", locationText: "Bldg C boiler room (ground floor, north side)" },
    { id: "A-CHILLER", name: "Main Building chiller (fan-coil AC)", type: "chiller", building: "A", locationText: "Bldg A roof" },
    { id: "A-LIFT-1", name: "Main Building lift 1 (lobby side)", type: "elevator", building: "A", locationText: "Bldg A lobby" },
    { id: "A-LIFT-2", name: "Main Building lift 2 (garden side)", type: "elevator", building: "A", locationText: "Bldg A garden entrance" },
    { id: "B-LIFT-1", name: "Garden Wing lift", type: "elevator", building: "B", locationText: "Bldg B core" },
    { id: "B-PUMP", name: "Garden Wing booster pump set", type: "water_pump", building: "B", locationText: "Bldg B plant room" },
    { id: "POOLMAIN-FILTER", name: "Main pool filtration + dosing", type: "pool_plant", building: "", locationText: "Main pool plant room" },
    { id: "POOLINF-HEATPUMP", name: "Infinity pool heat pump", type: "heat_pump", building: "", locationText: "Bldg D roof terrace" },
    { id: "SPA-HEATER", name: "Spa hammam steam generator + sauna heater", type: "boiler", building: "B", locationText: "Spa plant room" },
    { id: "BEACHBAR-COLD", name: "Beach bar cold room + ice machine", type: "refrigeration", building: "", locationText: "Kyma beach bar back-of-house" },
    { id: "LOCKS-CONTROLLER", name: "Door-lock server (key-card encoder)", type: "access_control", building: "A", locationText: "Back office, IT rack" },
    { id: "ELIA-AC", name: "Elia dining room split units (x4)", type: "split_ac", building: "C", locationText: "Sea Wing roof, Elia" },
  ].map((e) => row({ code: e.id, kind: "equipment", aliases: equipmentAliases({ ...e, serves: "", installedYear: "" }) })),
];

const index = new LocationIndex(rows);

const cases: [string | null, string | null, string, string][] = [
  // typed, free text, expected code, expected method
  ["Rm 312", null, "312", "alias"],
  ["312 - bath", null, "312", "inferred"],
  ["A-312", null, "312", "alias"],
  ["Δωμ. 262", null, "262", "alias"],
  ["dwm 262", null, "262", "alias"],
  ["Villa 12", null, "V12", "alias"],
  ["V-12", null, "V12", "alias"],
  ["vila 12", null, "V12", "alias"],
  ["villa 5", null, "V05", "alias"],
  ["Bldg C boiler room", null, "C-BOILER", "alias"],
  ["Λεβητοστάσιο C", null, "C-BOILER", "alias"],
  ["boiler room bldg C, pump noise", null, "C-BOILER", "inferred"],
  ["Garden Wing lift", null, "B-LIFT-1", "alias"],
  ["lift garden wing", null, "B-LIFT-1", "inferred"],
  ["lobby lift stuck between floors", null, "A-LIFT-1", "inferred"],
  ["Kyma bar", null, "BEACHBAR", "inferred"],
  ["Main pool plant room", null, "POOLMAIN-FILTER", "alias"],
  ["main pool plant", null, "POOLMAIN-FILTER", "inferred"],
  ["Bldg D roof terrace", "Infinity pool heat pump filter clean", "POOLINF-HEATPUMP", "alias"],
  ["Cliff Wing roof", "Infinity pool heat pump filter clean", "POOLINF-HEATPUMP", "inferred"],
  ["Κεντρικό κτίριο, ασανσέρ", null, "A-LIFT-1", "inferred"],
  ["Sea Wing 3rd floor corridor", null, "C/3", "inferred"],
  ["Sea Wing ground floor", null, "C", "inferred"],
  [null, "Second time we report it, no hot water in 274", "274", "inferred"],
  [null, "lift in the Garden Wing stuck again", "B-LIFT-1", "inferred"],
  [null, "The key cards failed across the Main Building after the lock server update", "LOCKS-CONTROLLER", "inferred"],
  ["", "Water dripping from the bathroom ceiling in 214, probably from 314 above", "214", "inferred"],
];

describe("inferLocation", () => {
  for (const [typed, text, code, method] of cases) {
    it(`${JSON.stringify(typed)} / ${JSON.stringify(text)} → ${code} (${method})`, () => {
      const hit = inferLocation(typed, text, index);
      expect(hit?.code).toBe(code);
      expect(hit?.method).toBe(method);
    });
  }

  it("returns null when nothing matches", () => {
    expect(inferLocation("somewhere", "the staff were lovely", index)).toBeNull();
    expect(inferLocation("Rm 999", null, index)).toBeNull();
  });
});
