import { describe, expect, it } from "vitest";
import { applyMappingOverrides, columnsOfFile, type ImportMapping } from "./mapping";
import type { RealityReport } from "@/reality/types";

const report = {
  files: [
    {
      path: "work_orders.csv",
      fields: [
        { field: "id", columns: ["Ticket No"] },
        { field: "created_at", columns: ["Created"] },
        { field: "description", columns: ["Description"] },
      ],
      unmappedColumns: ["Opened", "Notes"],
      identityColumns: ["Technician"],
    },
  ],
} as unknown as RealityReport;
const mapping: ImportMapping = { version: "import-mapping-v1", files: [{ path: "work_orders.csv", dataset: "work_orders", monthFirst: false, fields: { id: ["Ticket No"], created_at: ["Created"], description: ["Description"] } }] };

describe("remembered column corrections", () => {
  it("win when the file still has the column, and are ignored when it does not", () => {
    const out = applyMappingOverrides(mapping, report, { work_orders: { created_at: "Opened", description: "Gone", closed_at: "" } });
    expect(out.files[0].fields.created_at).toEqual(["Opened"]);
    expect(out.files[0].fields.description).toEqual(["Description"]);
    expect(out.files[0].fields).not.toHaveProperty("closed_at");
    expect(mapping.files[0].fields.created_at).toEqual(["Created"]); // untouched
  });
  it("list a file's columns once, mapped first", () => {
    expect(columnsOfFile(report, "work_orders.csv")).toEqual(["Ticket No", "Created", "Description", "Opened", "Notes", "Technician"]);
    expect(columnsOfFile(report, "nope.csv")).toEqual([]);
    expect(applyMappingOverrides(mapping, report, undefined)).toBe(mapping);
  });
});
