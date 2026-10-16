import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, schema, withTenant, type Db } from "../index";
import { findProperty } from "../scripts/seed";
import { TEST_APP_URL, TEST_URL } from "./env";
import { expectDbError } from "./helpers";

let admin: Db;
let app: Db;
let groupId: string;
let propertyA: string;
let propertyB: string;
let otherGroup: string;
let otherGroupProperty: string;

beforeAll(async () => {
  admin = createDb(TEST_URL, { max: 2 });
  app = createDb(TEST_APP_URL, { max: 2 });
  const seeded = await findProperty(admin);
  if (!seeded) throw new Error("seed missing");
  groupId = seeded.groupId;
  propertyA = seeded.id;

  // A second property in the same group, and a property in another group.
  const [b] = await admin
    .insert(schema.properties)
    .values({ groupId, code: "RLS-B", name: "Second property" })
    .onConflictDoUpdate({
      target: [schema.properties.groupId, schema.properties.code],
      set: { name: "Second property" },
    })
    .returning({ id: schema.properties.id });
  propertyB = b.id;

  const [g2] = await admin
    .insert(schema.groups)
    .values({ code: "rls-other", name: "Other group" })
    .onConflictDoUpdate({ target: schema.groups.code, set: { name: "Other group" } })
    .returning({ id: schema.groups.id });
  otherGroup = g2.id;
  const [p2] = await admin
    .insert(schema.properties)
    .values({ groupId: otherGroup, code: "OTHER-1", name: "Other property" })
    .onConflictDoUpdate({
      target: [schema.properties.groupId, schema.properties.code],
      set: { name: "Other property" },
    })
    .returning({ id: schema.properties.id });
  otherGroupProperty = p2.id;

  for (const [pid, gid, ext] of [
    [propertyB, groupId, "rls-b-1"],
    [otherGroupProperty, otherGroup, "rls-other-1"],
  ] as const) {
    await admin
      .insert(schema.signals)
      .values({
        groupId: gid,
        propertyId: pid,
        source: "staff_report",
        externalId: ext,
        occurredAt: new Date(),
        textOriginal: `signal for ${ext}`,
      })
      .onConflictDoNothing();
  }
});

afterAll(async () => {
  await app.$client.end();
  await admin.$client.end();
});

describe("row-level security", () => {
  it("shows the app role nothing without a tenant context", async () => {
    const rows = await app.select({ id: schema.signals.id }).from(schema.signals).limit(5);
    expect(rows).toEqual([]);
    const props = await app.select({ id: schema.properties.id }).from(schema.properties);
    expect(props).toEqual([]);
  });

  it("limits reads to the properties named in the context", async () => {
    const onlyA = await withTenant(app, { groupId, propertyIds: [propertyA] }, (tx) =>
      tx
        .select({ propertyId: schema.signals.propertyId })
        .from(schema.signals)
        .where(eq(schema.signals.propertyId, propertyB)),
    );
    expect(onlyA).toEqual([]);

    const onlyB = await withTenant(app, { groupId, propertyIds: [propertyB] }, (tx) =>
      tx.select({ externalId: schema.signals.externalId }).from(schema.signals),
    );
    expect(onlyB.map((r) => r.externalId)).toEqual(["rls-b-1"]);

    const both = await withTenant(
      app,
      { groupId, propertyIds: [propertyA, propertyB] },
      (tx) =>
        tx
          .select({ n: sql<number>`count(distinct ${schema.signals.propertyId})::int` })
          .from(schema.signals),
    );
    expect(both[0].n).toBe(2);
  });

  it("never leaks another group's rows even when its property id is named", async () => {
    const rows = await withTenant(
      app,
      { groupId, propertyIds: [propertyA, otherGroupProperty] },
      (tx) =>
        tx
          .select({ externalId: schema.signals.externalId })
          .from(schema.signals)
          .where(eq(schema.signals.propertyId, otherGroupProperty)),
    );
    expect(rows).toEqual([]);
  });

  it("rejects writes outside the context", async () => {
    await expectDbError(
      withTenant(app, { groupId, propertyIds: [propertyA] }, (tx) =>
        tx.insert(schema.signals).values({
          groupId,
          propertyId: propertyB,
          source: "staff_report",
          externalId: "rls-smuggled",
          occurredAt: new Date(),
        }),
      ),
      /row-level security/,
    );
  });

  it("allows writes inside the context and scopes the context to the transaction", async () => {
    await withTenant(app, { groupId, propertyIds: [propertyB] }, (tx) =>
      tx
        .insert(schema.signals)
        .values({
          groupId,
          propertyId: propertyB,
          source: "staff_report",
          externalId: "rls-b-2",
          occurredAt: new Date(),
        })
        .onConflictDoNothing(),
    );
    // Outside the transaction the setting is gone again.
    const after = await app.select({ id: schema.signals.id }).from(schema.signals).limit(1);
    expect(after).toEqual([]);
  });

  it("keeps the pii schema out of reach of the app role", async () => {
    await expectDbError(
      app.execute(sql`select count(*) from pii.stay_keys`),
      /permission denied/,
    );
  });
});
