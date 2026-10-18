import { describe, expect, it } from "vitest";
import { classifyDate } from "../dates";
import { parseDate } from "@/import/loader";

describe("two-digit years and naive strings", () => {
  it("reads 15/07/26 as 2026", () => {
    const hit = classifyDate("15/07/26 14:30")!;
    expect(hit.parts).toMatchObject({ year: 2026, month: 7, day: 15, hour: 14, minute: 30 });
    expect(hit.format).toBe("DD/MM/YY HH:MM");
    expect(classifyDate("07/15/26")!.parts).toMatchObject({ year: 2026, month: 7, day: 15 });
    expect(classifyDate("15.07.26")!.parts).toMatchObject({ year: 2026, month: 7, day: 15 });
    expect(classifyDate("15/07/2026")!.format).toBe("DD/MM/YYYY");
  });
  it("never lets the runtime guess a zone for a naive string", () => {
    expect(parseDate("Wed Jul 15 2026 14:30", undefined, false, "Europe/Athens")).toBeNull();
    expect(parseDate("Jul 15 2026 14:30", undefined, false, "Europe/Athens")?.toISOString()).toBe("2026-07-15T11:30:00.000Z");
    expect(parseDate("tomorrow", undefined, false, "Europe/Athens")).toBeNull();
    expect(parseDate("2026-07-15T14:30:00+03:00", undefined, false, "Europe/Athens")?.toISOString()).toBe("2026-07-15T11:30:00.000Z");
    expect(parseDate("15/07/2026 14:30", undefined, false, "Europe/Athens")?.toISOString()).toBe("2026-07-15T11:30:00.000Z");
  });
});
