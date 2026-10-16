import { describe, expect, it } from "vitest";
import { classifyText, type ClassifyHints } from "../taxonomy";

const cases: [string, ClassifyHints, string | null, string | null][] = [
  // text, hints, expected topic, expected category
  ["no hot water", {}, "no_hot_water", "plumbing"],
  ["Heute Morgen gab es kein warmes Wasser in der Dusche, nach zehn Minuten höchstens lauwarm.", {}, "no_hot_water", "plumbing"],
  ["Stamattina niente acqua calda in doccia.", {}, "no_hot_water", "plumbing"],
  ["klimatistiko den kryonei rm 312 parapono pelati", { woCategory: "Other" }, "ac_not_cooling", "hvac"],
  ["Η κάρτα δεν δούλεψε πάλι απόψε, μείναμε απ' έξω τα μεσάνυχτα με τα παιδιά.", {}, "keycard_fails", "locks_doors"],
  ["Lift not working, guests using stairs", { woCategory: "Lift" }, "elevator_stuck", "elevator"],
  ["Mosquitoes in room, bitten all night", {}, "mosquitoes", "pest"],
  ["Guest reports sunbeds all reserved with towels by 8am", {}, "sunbeds", "facilities"],
  ["PM: chiller A condenser coil wash", { woCategory: "HVAC" }, "preventive", "preventive"],
  ["pistolaki xalasmeno 262", { woCategory: "Plumbing" }, "hairdryer", "appliance"],
  ["TV remote not working 295", { woCategory: "Plumbing" }, "remote", "it_tv"],
  ["Water dripping from bathroom ceiling 214", { fdDepartment: "Maintenance" }, "ceiling_leak", "plumbing"],
  ["Το ντους δεν αδειάζει, γεμίζει νερό.", {}, "drain_blocked", "plumbing"],
  ["La musique du beach bar nous a empêchés de dormir jusqu'à minuit.", {}, "noise_music", "noise"],
  ["Le petit-déjeuner: 25 minutes d'attente pour une table et plus de café.", {}, "breakfast_slow", "fnb_service"],
  ["Das Bett war viel zu hart, mein Rücken tat jeden Morgen weh.", {}, "bed_uncomfortable", "furniture"],
  ["Everything was perfect, thank you for a wonderful stay.", {}, null, null],
  ["Shower head clogged", { woCategory: "Plumbing" }, "shower_head", "plumbing"],
  ["Balcony chair broken", { fdDepartment: "Maintenance" }, "balcony_furniture", "furniture"],
  ["Можно нам две дополнительные подушки?", { fdDepartment: "Housekeeping" }, "request_pillows", "request"],
  ["Το κουρτινόξυλο ξεκόλλησε από τον τοίχο από τη μία μεριά.", {}, "curtain", "furniture"],
];

describe("classifyText", () => {
  for (const [text, hints, topic, category] of cases) {
    it(`"${text.slice(0, 45)}" → ${topic ?? "none"}`, () => {
      const c = classifyText(text, hints);
      expect(c.topic).toBe(topic);
      expect(c.category).toBe(category);
    });
  }

  it("falls back to the drop-down when the text says nothing", () => {
    const c = classifyText("done", { woCategory: "Electrical" });
    expect(c.topic).toBeNull();
    expect(c.category).toBe("electrical");
    expect(c.method).toBe("dropdown");
  });

  it("ignores vague drop-downs", () => {
    expect(classifyText("ok", { woCategory: "Other" }).category).toBeNull();
    expect(classifyText("ok", { fdDepartment: "Maintenance" }).category).toBeNull();
  });
});
