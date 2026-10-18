import { describe, expect, it } from "vitest";
import { hash4, slugCode, transliterate } from "./codes";
import { knownPlaces, parseServes } from "./locations";

describe("codes from names a client's export carries", () => {
  it("transliterates Greek and accented Latin instead of dropping it", () => {
    expect(slugCode("Πισίνα")).toBe("PISINA");
    expect(slugCode("Εστιατόριο Ορίζοντας")).toBe("ESTIATORIO-ORIZONTAS");
    expect(slugCode("Κτίριο Β")).toBe("KTIRIO-V");
    expect(slugCode("Café Élan")).toBe("CAFE-ELAN");
    expect(slugCode("Main Pool")).toBe("MAIN-POOL");
    expect(slugCode("   ")).toBe("X");
    expect(slugCode("Γυμναστήριο της Θάλασσας και του Ήλιου").length).toBeLessThanOrEqual(24);
    expect(transliterate("Μπαρ Ντίσκο")).toBe("bar disko");
    expect(hash4("Πισίνα")).toMatch(/^[0-9A-F]{4}$/);
    expect(hash4("Πισίνα")).not.toBe(hash4("Σπα"));
    // two different Greek facilities never share a code
    expect(slugCode("Πισίνα")).not.toBe(slugCode("Σπα"));
  });
});

describe("the serves parser knows only the property's own places", () => {
  const known = knownPlaces([
    { kind: "building", code: "A", name: "Main Building", aliases: ["Bldg A", "Building A", "Κτίριο A"] },
    { kind: "building", code: "KTIRIO-V", name: "Κτίριο Β", aliases: ["Κτίριο Β", "Garden Wing"] },
    { kind: "facility", code: "REST-ORIZONTAS", name: "Orizontas Restaurant", aliases: ["Orizontas Restaurant"] },
    { kind: "facility", code: "LOBBY", name: "Lobby & Reception", aliases: [] },
    { kind: "facility", code: "SPA", name: "Thalassa Spa", aliases: [] },
    { kind: "facility", code: "PISINA", name: "Πισίνα", aliases: ["Pool"] },
  ]);

  it("resolves the demo's phrasing without any hard-wired code", () => {
    expect(parseServes("all rooms in A, lobby, Orizontas kitchen", known)).toEqual({ codes: ["A", "LOBBY", "REST-ORIZONTAS"], unresolved: [] });
    expect(parseServes("floors 1-3 A + Orizontas", known).codes).toEqual(["A", "REST-ORIZONTAS"]);
    expect(parseServes("all guest-room locks", known).codes.sort()).toEqual(["A", "KTIRIO-V"]);
    expect(parseServes("spa", known).codes).toEqual(["SPA"]);
  });

  it("reads Greek the same way", () => {
    expect(parseServes("όλα τα δωμάτια στο Κτίριο Β, Πισίνα", known)).toEqual({ codes: ["KTIRIO-V", "PISINA"], unresolved: [] });
    expect(parseServes("Garden Wing rooms; Thalassa", known).codes).toEqual(["KTIRIO-V", "SPA"]);
  });

  it("returns what it could not place instead of guessing", () => {
    const r = parseServes("the helipad, lobby", known);
    expect(r.codes).toEqual(["LOBBY"]);
    expect(r.unresolved).toEqual(["the helipad"]);
    expect(parseServes("", known)).toEqual({ codes: [], unresolved: [] });
  });
});
