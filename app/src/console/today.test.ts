import { describe, expect, it } from "vitest";
import { isExportLate } from "./today";

describe("is the nightly export late", () => {
  const tz = "Europe/Athens";
  const at = (iso: string) => new Date(iso);
  it("only once the expected time has passed with no import since", () => {
    // 06:10 Athens on 18 Oct is 03:10Z
    expect(isExportLate({ importTime: "06:10", lastImportAt: at("2026-10-17T03:30:00Z"), now: at("2026-10-18T02:00:00Z"), timeZone: tz })).toBe(false);
    expect(isExportLate({ importTime: "06:10", lastImportAt: at("2026-10-17T03:30:00Z"), now: at("2026-10-18T04:00:00Z"), timeZone: tz })).toBe(true);
    expect(isExportLate({ importTime: "06:10", lastImportAt: at("2026-10-18T03:20:00Z"), now: at("2026-10-18T04:00:00Z"), timeZone: tz })).toBe(false);
    expect(isExportLate({ importTime: "06:10", lastImportAt: null, now: at("2026-10-18T04:00:00Z"), timeZone: tz })).toBe(true);
  });
  it("is never late without an expected time", () => {
    expect(isExportLate({ importTime: null, lastImportAt: null, now: at("2026-10-18T04:00:00Z"), timeZone: tz })).toBe(false);
    expect(isExportLate({ importTime: "soon", lastImportAt: null, now: at("2026-10-18T04:00:00Z"), timeZone: tz })).toBe(false);
  });
});
