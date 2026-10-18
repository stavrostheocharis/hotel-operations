import { describe, expect, it } from "vitest";
import { stableKey } from "./keys";

describe("external ids for records without one", () => {
  it("come from what the record is, not from the whole row", () => {
    const a = stableKey(["02/07/2026 13:44", "263", "No hot water"], { Created: "02/07/2026 13:44", Room: "263", Text: "No hot water", Agent: "X" });
    const b = stableKey(["02/07/2026 13:44", "263", "No hot water"], { Text: "No hot water", Room: "263", Created: "02/07/2026 13:44", Agent: "Y", Extra: "1" });
    expect(a).toBe(b);
    expect(a).toMatch(/^k_[0-9a-f]{16}$/);
    expect(stableKey(["02/07/2026 13:44", "263", "No hot water!"], {})).not.toBe(a);
    expect(stableKey(["  02/07/2026 13:44 ", "263", "no  hot water"], {})).toBe(a);
  });
  it("fall back to the row when nothing identifying is there", () => {
    expect(stableKey([undefined, "", null], { a: "1" })).toBe(stableKey([], { a: "1" }));
    expect(stableKey([], { a: "1" })).not.toBe(stableKey([], { a: "2" }));
  });
});
