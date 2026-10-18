import { describe, expect, it } from "vitest";
import { safeReturnPath } from "./return-path";

describe("the ?next= return path", () => {
  it("keeps paths on this site", () => {
    expect(safeReturnPath("/exceptions?view=open&page=2")).toBe("/exceptions?view=open&page=2");
    expect(safeReturnPath("/issues/3b672f2a")).toBe("/issues/3b672f2a");
    expect(safeReturnPath("/")).toBe("/");
  });
  it("refuses everything that could leave it", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "/\\\\evil.com", "https://evil.com", "evil.com", "javascript:alert(1)", "/%5Cevil.com\n", " /today", "", null, undefined, "/today\u0000"]) {
      expect(safeReturnPath(bad), String(bad)).toBeNull();
    }
    // a path with a backslash later on is only ever a path
    expect(safeReturnPath("/a/b\\c")).toBe("/a/b/c");
  });
});
