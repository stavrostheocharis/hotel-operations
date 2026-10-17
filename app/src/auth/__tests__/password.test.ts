import { describe, expect, it } from "vitest";
import { hashPassword, MIN_PASSWORD_LENGTH, passwordProblem, verifyPassword } from "../password";

describe("password hashing", () => {
  it("verifies what it hashed and nothing else", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash.startsWith("scrypt$32768$8$1$")).toBe(true);
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("correct horse batter", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("salts every hash", async () => {
    const a = await hashPassword("same password");
    const b = await hashPassword("same password");
    expect(a).not.toBe(b);
    expect(await verifyPassword("same password", b)).toBe(true);
  });

  it("rejects malformed stored values without throwing", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$whatever")).toBe(false);
    expect(await verifyPassword("x", "scrypt$abc$8$1$c2FsdA==$")).toBe(false);
  });

  it("treats Unicode-equivalent passwords as the same", async () => {
    const hash = await hashPassword("café");
    expect(await verifyPassword("café", hash)).toBe(true);
  });

  it("names the problem with a weak password", () => {
    expect(passwordProblem("short")).toMatch(String(MIN_PASSWORD_LENGTH));
    expect(passwordProblem(" padded-password ")).toMatch(/spaces/);
    expect(passwordProblem("long enough password")).toBeNull();
  });
});
