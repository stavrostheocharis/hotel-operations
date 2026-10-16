import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, schema, type Db } from "../index";
import { findProperty } from "../scripts/seed";
import { TEST_URL } from "./env";
import { expectDbError } from "./helpers";

let db: Db;

beforeAll(() => {
  db = createDb(TEST_URL, { max: 2 });
});

afterAll(async () => {
  await db.$client.end();
});

describe("migrations", () => {
  it("create every table in public and the pii schema", async () => {
    const rows = await db.execute<{ table_schema: string; table_name: string }>(
      sql`select table_schema, table_name from information_schema.tables
          where table_schema in ('public', 'pii') order by 1, 2`,
    );
    const names = rows.map((r) => `${r.table_schema}.${r.table_name}`);
    for (const expected of [
      "public.groups",
      "public.properties",
      "public.users",
      "public.memberships",
      "public.locations",
      "public.location_links",
      "public.signals",
      "public.issues",
      "public.issue_signals",
      "public.actions",
      "public.outcomes",
      "public.events",
      "public.ai_suggestions",
      "public.signal_embeddings",
      "public.occupancy_daily",
      "pii.stay_keys",
    ]) {
      expect(names, `missing ${expected}`).toContain(expected);
    }
  });

  it("install pgvector and the hnsw index", async () => {
    const ext = await db.execute<{ extname: string }>(
      sql`select extname from pg_extension where extname = 'vector'`,
    );
    expect(ext.length).toBe(1);
    const idx = await db.execute<{ indexdef: string }>(
      sql`select indexdef from pg_indexes where indexname = 'signal_embeddings_hnsw_idx'`,
    );
    expect(idx[0]?.indexdef).toMatch(/USING hnsw/i);
  });

  it("enable and force row-level security on every tenant table", async () => {
    const rows = await db.execute<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      sql`select c.relname, c.relrowsecurity, c.relforcerowsecurity
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'r'`,
    );
    const unprotected = rows
      .filter((r) => !r.relrowsecurity || !r.relforcerowsecurity)
      .map((r) => r.relname);
    expect(unprotected).toEqual([]);
  });
});

describe("immutability", () => {
  it("rejects changes to the observation fields of a signal", async () => {
    const property = await findProperty(db);
    const [sig] = await db
      .select({ id: schema.signals.id })
      .from(schema.signals)
      .limit(1);
    expect(property).not.toBeNull();
    await expectDbError(
      db
        .update(schema.signals)
        .set({ textOriginal: "tampered" })
        .where(sql`${schema.signals.id} = ${sig.id}`),
      /immutable/,
    );
  });

  it("allows derived fields of a signal to be filled in", async () => {
    const [sig] = await db
      .select({ id: schema.signals.id })
      .from(schema.signals)
      .limit(1);
    await db
      .update(schema.signals)
      .set({ textEn: "translated later", language: "el" })
      .where(sql`${schema.signals.id} = ${sig.id}`);
    const [after] = await db
      .select({ textEn: schema.signals.textEn })
      .from(schema.signals)
      .where(sql`${schema.signals.id} = ${sig.id}`);
    expect(after.textEn).toBe("translated later");
  });

  it("rejects UPDATE and DELETE on events", async () => {
    const [ev] = await db
      .select({ id: schema.events.id })
      .from(schema.events)
      .limit(1);
    await expectDbError(
      db
        .update(schema.events)
        .set({ actor: "someone" })
        .where(sql`${schema.events.id} = ${ev.id}`),
      /immutable/,
    );
    await expectDbError(
      db.delete(schema.events).where(sql`${schema.events.id} = ${ev.id}`),
      /immutable/,
    );
  });
});
