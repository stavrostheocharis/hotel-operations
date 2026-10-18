import { describe, expect, it } from "vitest";
import { canSee } from "../screens";

describe("which roles may open which screen", () => {
  it("follows the sidebar", () => {
    expect(canSee("readonly", "today")).toBe(true);
    expect(canSee("readonly", "verifications")).toBe(false);
    expect(canSee("staff", "signals")).toBe(false);
    expect(canSee("supervisor", "review")).toBe(true);
    expect(canSee("supervisor", "reports")).toBe(false);
    expect(canSee("dept_head", "settings")).toBe(true);
    expect(canSee("dept_head", "imports")).toBe(false);
    expect(canSee("gm", "imports")).toBe(true);
    expect(canSee("group_admin", "settings")).toBe(true);
  });
});
