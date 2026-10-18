import { randomUUID } from "node:crypto";
import { copyFile, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, schema, type Db } from "../index";
import { countSignals } from "../scripts/load-synthetic";
import { dataDir } from "../scripts/lib/paths";
import { findProperty } from "../scripts/seed";
import { loadBatch } from "@/import/loader";
import { mappingFromReport, missingForLoad, REQUIRED_FOR_LOAD, type ImportMapping } from "@/import/mapping";
import { linkSignals } from "@/link/pipeline";
import { createFakeLlm } from "@/normalize/llm";
import { normalizeSignals } from "@/normalize/pipeline";
import { runRealityCheck } from "@/reality";
import { TEST_URL } from "./env";

/**
 * The real-export loader, fed the demo season through the mapping the
 * reality check derives, must land the same records the hand-written
 * synthetic loader does. A second property in the same group receives the
 * import so the two can be compared row for row.
 */
const CODE = "IMPORT-B";
let admin: Db;
let a: { id: string; groupId: string };
let b: { id: string; groupId: string };
let mapping: ImportMapping;

beforeAll(async () => {
  admin = createDb(TEST_URL, { max: 2 });
  const p = await findProperty(admin);
  if (!p) throw new Error("seed missing");
  a = p;
  const [row] = await admin
    .insert(schema.properties)
    .values({ groupId: p.groupId, code: CODE, name: "Import target", timezone: "Europe/Athens" })
    .onConflictDoUpdate({ target: [schema.properties.groupId, schema.properties.code], set: { name: "Import target" } })
    .returning({ id: schema.properties.id, groupId: schema.properties.groupId });
  b = row;
  await admin.insert(schema.locations).values({ groupId: b.groupId, propertyId: b.id, kind: "property", code: CODE, name: "Import target", aliases: [] }).onConflictDoNothing();
  const { report } = await runRealityCheck(dataDir());
  mapping = mappingFromReport(report);
  // the yardstick: the demo property linked, so the two can be compared
  await linkSignals(admin, { llm: createFakeLlm() });
});

afterAll(async () => {
  await admin.$client.end();
});

describe("the import mapping", () => {
  it("derives, from the reality check, a mapping with every field the loader needs", () => {
    const datasets = new Set(mapping.files.map((f) => f.dataset));
    for (const ds of ["rooms", "facilities", "equipment", "stays", "work_orders", "complaints", "surveys", "reviews", "occupancy"]) expect(datasets, ds).toContain(ds);
    for (const f of mapping.files) {
      expect(missingForLoad(f), f.path).toEqual([]);
      for (const field of REQUIRED_FOR_LOAD[f.dataset] ?? []) expect(field.split("|").some((alt) => f.fields[alt]?.length), `${f.path} ${field}`).toBe(true);
    }
    expect(mapping.files.find((f) => f.dataset === "work_orders")!.fields.created_at).toBeDefined();
  });
});

describe("the real-export loader", () => {
  it("loads the demo season into a second property with the same counts as the synthetic loader", async () => {
    const batchId = randomUUID();
    const res = await loadBatch(admin, { propertyCode: CODE, dir: dataDir(), mapping, batchId });
    expect(res.skipped).toEqual([]);
    const expected = await countSignals(admin, a.id);
    const got = await countSignals(admin, b.id);
    for (const source of ["work_order", "front_desk", "survey", "review", "pms"]) {
      expect(got[source], source).toBe(expected[source]);
      expect(res.sources[source].inserted, source).toBe(expected[source]);
    }
    const kinds = async (pid: string) => {
      const rows = await admin.execute<{ kind: string; n: number }>(sql`select kind::text as kind, count(*)::int as n from locations where property_id = ${pid} group by kind`);
      return Object.fromEntries(rows.map((r) => [r.kind, Number(r.n)]));
    };
    expect(await kinds(b.id)).toEqual(await kinds(a.id));
    const [{ n: links }] = await admin.execute<{ n: number }>(sql`select count(*)::int as n from location_links l join locations x on x.id = l.equipment_id where x.property_id = ${b.id}`);
    const [{ n: linksA }] = await admin.execute<{ n: number }>(sql`select count(*)::int as n from location_links l join locations x on x.id = l.equipment_id where x.property_id = ${a.id}`);
    expect(Number(links)).toBe(Number(linksA));
    const [{ n: occ }] = await admin.execute<{ n: number }>(sql`select count(*)::int as n from occupancy_daily where property_id = ${b.id}`);
    const [{ n: occA }] = await admin.execute<{ n: number }>(sql`select count(*)::int as n from occupancy_daily where property_id = ${a.id}`);
    expect(Number(occ)).toBe(Number(occA));
    const [{ n: keys }] = await admin.execute<{ n: number }>(sql`select count(*)::int as n from pii.stay_keys where property_id = ${b.id}`);
    const [{ n: keysA }] = await admin.execute<{ n: number }>(sql`select count(*)::int as n from pii.stay_keys where property_id = ${a.id}`);
    expect(Number(keys)).toBe(Number(keysA));
    // every signal carries the batch and a canonical record; nobody's name is in it
    const [{ n: tagged }] = await admin.execute<{ n: number }>(sql`select count(*)::int as n from signals where property_id = ${b.id} and ingest_batch_id = ${batchId}`);
    expect(Number(tagged)).toBe(Object.values(got).reduce((x, y) => x + y, 0));
    const [wo] = await admin.execute<{ mapped: Record<string, string>; raw: Record<string, string> }>(sql`select mapped, raw from signals where property_id = ${b.id} and source = 'work_order' limit 1`);
    expect(wo.mapped.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(wo.mapped.id).toBeTruthy();
    expect(Object.keys(wo.raw).some((k) => /guest|name|email|phone/i.test(k))).toBe(false);
    const events = await admin.execute<{ type: string }>(sql`select type from events where property_id = ${b.id} and type = 'ingest.completed'`);
    expect(events.length).toBe(1);
    // identity stays in pii.stay_keys: the stay's pseudonym is its external id, nothing in raw or mapped names it
    const [stay] = await admin.execute<{ external_id: string; stay_ref: string; mapped: Record<string, unknown>; raw: Record<string, unknown> }>(sql`select external_id, stay_ref, mapped, raw from signals where property_id = ${b.id} and source = 'pms' limit 1`);
    expect(stay.external_id).toBe(stay.stay_ref);
    expect(stay.external_id).toMatch(/^stay_[0-9a-f]{24}$/);
    expect(stay.mapped).not.toHaveProperty("stay_key");
    expect(stay.mapped).not.toHaveProperty("nationality");
    expect(stay.raw).not.toHaveProperty("reservation_no");
    const [survey] = await admin.execute<{ mapped: Record<string, unknown>; raw: Record<string, unknown> }>(sql`select mapped, raw from signals where property_id = ${b.id} and source = 'survey' limit 1`);
    expect(survey.mapped).not.toHaveProperty("stay_key");
    expect(survey.raw).not.toHaveProperty("reservation_no");
    const [tech] = await admin.execute<{ mapped: Record<string, unknown>; raw: Record<string, unknown> }>(sql`select mapped, raw from signals where property_id = ${b.id} and source = 'work_order' and mapped->>'assigned_to' is not null limit 1`);
    expect(String(tech.mapped.assigned_to)).toMatch(/^staff_[0-9a-f]{12}$/);
    expect(tech.raw).not.toHaveProperty("Technician");
    // and the synthetic loader (property A) does the same, so the two stay comparable
    const [stayA] = await admin.execute<{ external_id: string; stay_ref: string; raw: Record<string, unknown> }>(sql`select external_id, stay_ref, raw from signals where property_id = ${a.id} and source = 'pms' limit 1`);
    expect(stayA.external_id).toBe(stayA.stay_ref);
    expect(stayA.raw).not.toHaveProperty("reservation_no");
    expect(mapping.files.find((f) => f.dataset === "work_orders")?.drop ?? []).toEqual([]);
  });

  it("inserts nothing when the same export is loaded again", async () => {
    const res = await loadBatch(admin, { propertyCode: CODE, dir: dataDir(), mapping, batchId: randomUUID() });
    for (const s of Object.values(res.sources)) expect(s.inserted).toBe(0);
    expect(res.locations.created).toBe(0);
    expect(res.stayKeys).toBe(0);
  });

  it("normalises and links the imported records like the synthetic ones", async () => {
    const n = await normalizeSignals(admin, { propertyCode: CODE, llm: createFakeLlm() });
    expect(n.processed).toBeGreaterThan(100);
    const [{ n: located }] = await admin.execute<{ n: number }>(sql`select count(*)::int as n from signals where property_id = ${b.id} and source = 'work_order' and location_id is not null`);
    expect(Number(located)).toBeGreaterThan(0);
    const l = await linkSignals(admin, { propertyCode: CODE, llm: createFakeLlm() });
    expect(l.issues).toBeGreaterThan(5);
    const [{ n: issuesA }] = await admin.execute<{ n: number }>(sql`select count(*)::int as n from issues where property_id = ${a.id} and superseded_at is null`);
    expect(l.issues).toBeGreaterThanOrEqual(Math.floor(Number(issuesA) * 0.6));
    expect(l.issues).toBeLessThanOrEqual(Math.ceil(Number(issuesA) * 1.4));
    const [boiler] = await admin.execute<{ n: number }>(sql`select count(*)::int as n from issues i join locations x on x.id = i.location_id where i.property_id = ${b.id} and x.code = 'C-BOILER'`);
    expect(Number(boiler.n)).toBeGreaterThanOrEqual(1);
  });
});

describe("a later export of the same records", () => {
  it("updates the canonical record of a ticket that closed since, and queues it for normalisation again", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "oem-export-"));
    try {
      for (const name of await readdir(dataDir())) await copyFile(path.join(dataDir(), name), path.join(tmp, name));
      const file = path.join(tmp, "work_orders.csv");
      const lines = (await readFile(file, "utf8")).split(/\r?\n/);
      // Ticket No;Created;Closed;Location;Category;Description;Closure Note;Technician;Status;Priority;Reported By;Reopened
      const idx = lines.findIndex((l, i) => i > 0 && l.split(";")[2] === "");
      const cols = lines[idx].split(";");
      const ticket = cols[0];
      cols[2] = cols[1].replace(/\d{2}:\d{2}$/, "23:30");
      cols[6] = "fixed the same evening";
      cols[8] = "closed";
      lines[idx] = cols.join(";");
      await writeFile(file, lines.join("\n"));

      const [before] = await admin.execute<{ id: string; mapped: Record<string, unknown> }>(sql`select id, mapped from signals where property_id = ${b.id} and source = 'work_order' and external_id = ${ticket}`);
      expect(before.mapped.closed_at).toBeNull();
      const res = await loadBatch(admin, { propertyCode: CODE, dir: tmp, mapping, batchId: randomUUID() });
      expect(res.sources.work_order.inserted).toBe(0);
      expect(res.sources.work_order.updated).toBe(1);
      expect(res.sources.work_order.skipped).toBe(res.sources.work_order.rows - 1);
      for (const [source, s] of Object.entries(res.sources)) if (source !== "work_order") expect(s.updated, source).toBe(0);
      const [after] = await admin.execute<{ mapped: Record<string, unknown>; normalized_at: Date | null; raw: Record<string, unknown> }>(sql`select mapped, normalized_at, raw from signals where id = ${before.id}`);
      expect(after.mapped.closed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(after.mapped.status).toBe("closed");
      expect(after.mapped.closure_note).toBe("fixed the same evening");
      expect(String(after.raw.Closed ?? "")).toBe(""); // raw is immutable: the first observation stays
      expect(after.normalized_at).toBeNull();
      const events = await admin.execute<{ n: number }>(sql`select count(*)::int as n from events where entity_id = ${before.id} and type = 'signal.updated'`);
      expect(Number(events[0].n)).toBe(1);
      const n = await normalizeSignals(admin, { propertyCode: CODE, llm: createFakeLlm() });
      expect(n.processed).toBe(1);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

describe("the imports read model", () => {
  it("the import batch row rolls up what the load did", async () => {
    const [row] = await admin
      .insert(schema.importBatches)
      .values({ groupId: b.groupId, propertyId: b.id, source: "folder", dir: dataDir(), files: [{ name: "work_orders.csv", bytes: 10 }], bytes: 10, status: "loaded", verdict: "go", counts: { sources: { work_order: { rows: 3, inserted: 2, updated: 0, skipped: 1, located: 2, piiRows: 0 } }, locations: { created: 0, links: 0 }, stayKeys: 0, occupancy: 0, skipped: [] } })
      .returning({ id: schema.importBatches.id, files: schema.importBatches.files });
    expect(row.files).toEqual([{ name: "work_orders.csv", bytes: 10 }]);
    await admin.delete(schema.importBatches).where(eq(schema.importBatches.id, row.id));
  });
});
