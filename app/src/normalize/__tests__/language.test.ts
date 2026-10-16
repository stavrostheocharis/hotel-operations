import { describe, expect, it } from "vitest";
import { detectLanguage } from "../language";

const cases: [string, string | null][] = [
  ["There was no hot water in the shower this morning, only lukewarm after ten minutes.", "en"],
  ["Heute Morgen gab es kein warmes Wasser in der Dusche, nach zehn Minuten höchstens lauwarm.", "de"],
  ["Pas d'eau chaude sous la douche ce matin, à peine tiède après dix minutes.", "fr"],
  ["Stamattina niente acqua calda in doccia, appena tiepida dopo dieci minuti.", "it"],
  ["Δεν είχε ζεστό νερό στο ντους το πρωί, μετά από δέκα λεπτά ίσα ίσα χλιαρό.", "el"],
  ["Утром в душе не было горячей воды, через десять минут едва тёплая.", "ru"],
  ["לא היו מים חמים במקלחת הבוקר, אחרי עשר דקות בקושי פושרים.", "he"],
  ["klimatistiko den kryonei rm 312 parapono pelati", "el-latn"],
  ["pistolaki xalasmeno 262", "el-latn"],
  ["AC not cooling, guest waiting in the room", "en"],
  ["Shower head clogged", "en"],
  ["έγινε", "el"],
  ["4012", null],
];

describe("detectLanguage", () => {
  for (const [text, expected] of cases) {
    it(`detects ${expected} for "${text.slice(0, 40)}"`, () => {
      expect(detectLanguage(text).language).toBe(expected);
    });
  }

  it("reports a confidence between 0 and 1", () => {
    const g = detectLanguage("Das Zimmer war sehr laut in der Nacht.");
    expect(g.confidence).toBeGreaterThan(0.5);
    expect(g.confidence).toBeLessThanOrEqual(1);
  });
});
