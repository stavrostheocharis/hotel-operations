import { randomUUID } from "node:crypto";
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

describe("the imports read model", () => {
  it("the import batch row rolls up what the load did", async () => {
    const [row] = await admin
      .insert(schema.importBatches)
      .values({ groupId: b.groupId, propertyId: b.id, source: "folder", dir: dataDir(), files: [{ name: "work_orders.csv", bytes: 10 }], bytes: 10, status: "loaded", verdict: "go", counts: { sources: { work_order: { rows: 3, inserted: 2, skipped: 1, located: 2, piiRows: 0 } }, locations: { created: 0, links: 0 }, stayKeys: 0, occupancy: 0, skipped: [] } })
      .returning({ id: schema.importBatches.id, files: schema.importBatches.files });
    expect(row.files).toEqual([{ name: "work_orders.csv", bytes: 10 }]);
    await admin.delete(schema.importBatches).where(eq(schema.importBatches.id, row.id));
  });
});
