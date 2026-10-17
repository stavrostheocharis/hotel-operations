import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, schema, type Db, type TenantContext } from "../index";
import { findProperty } from "../scripts/seed";
import { AuthorizationError, type Actor } from "@/auth/permissions";
import { listAssignableUsers } from "@/console/issue-detail";
import { addAlias, createLocation, mapSpelling, removeAlias, setServes } from "@/console/location-admin";
import { getLocationByCode, getLocationTree, listIssuesAtLocation, listUnlinkedSignalsAtLocation, listUnresolvedSpellings } from "@/console/locations";
import { linkSignals } from "@/link/pipeline";
import { createFakeLlm } from "@/normalize/llm";
import { LocationIndex, inferLocation, type LocationRow } from "@/normalize/location-rules";
import { TEST_APP_URL, TEST_URL } from "./env";

let admin: Db;
let app: Db;
let ctx: TenantContext;
let propertyId: string;
let gm: Actor;
let staff: Actor;

beforeAll(async () => {
  admin = createDb(TEST_URL, { max: 2 });
  app = createDb(TEST_APP_URL, { max: 2 });
  const p = await findProperty(admin);
  if (!p) throw new Error("seed missing");
  ctx = { groupId: p.groupId, propertyIds: [p.id] };
  propertyId = p.id;
  await linkSignals(admin, { llm: createFakeLlm() });
  const users = await listAssignableUsers(app, ctx, p.id);
  gm = { userId: users.find((u) => u.role === "gm")!.id, role: "gm", department: "management" };
  staff = { userId: users.find((u) => u.role === "staff")!.id, role: "staff", department: "engineering" };
});

afterAll(async () => {
  await app.$client.end();
  await admin.$client.end();
});

describe("the locations browser", () => {
  it("builds the tree with counts that roll up", async () => {
    const tree = await getLocationTree(app, ctx);
    expect(tree.buildings.length).toBeGreaterThanOrEqual(4);
    expect(tree.facilities.length).toBeGreaterThan(5);
    expect(tree.equipment.length).toBeGreaterThan(10);
    const c = tree.buildings.find((b) => b.code === "C")!;
    expect(c.children.length).toBeGreaterThan(0);
    const roomsBelow = c.children.flatMap((f) => f.children);
    expect(roomsBelow.length).toBeGreaterThan(10);
    expect(c.below.total).toBeGreaterThanOrEqual(c.counts.total + roomsBelow.reduce((n, r) => n + r.counts.total, 0));
    const boiler = tree.equipment.find((e) => e.code === "C-BOILER")!;
    expect(boiler.serves).toContain("C");
    expect(boiler.counts.recurring).toBeGreaterThanOrEqual(1);
  });

  it("describes one place: chain, what serves it, history with and without the places below", async () => {
    const room = (await getLocationByCode(app, ctx, "263"))!;
    expect(room.kind).toBe("room");
    expect(room.chain.map((c) => c.kind)).toEqual(["floor", "building"]);
    expect(room.servedBy.some((e) => e.code === "C-BOILER")).toBe(true);
    const building = (await getLocationByCode(app, ctx, "C"))!;
    expect(building.descendantIds.length).toBeGreaterThan(room.descendantIds.length);
    const here = await listIssuesAtLocation(app, ctx, { ids: [building.id] });
    const below = await listIssuesAtLocation(app, ctx, { ids: building.descendantIds });
    expect(below.total).toBeGreaterThan(here.total);
    expect(below.rows.every((i) => i.signals >= 1)).toBe(true);
    const loose = await listUnlinkedSignalsAtLocation(app, ctx, building.descendantIds);
    expect(loose.total).toBeGreaterThanOrEqual(0);
    const boiler = (await getLocationByCode(app, ctx, "C-BOILER"))!;
    expect(boiler.serves.some((s) => s.code === "C")).toBe(true);
    expect(await getLocationByCode(app, ctx, "NOPE")).toBeNull();
  });
});

describe("location settings", () => {
  it("lists the spellings nothing resolved and maps one to a place, moving its records", async () => {
    const spellings = await listUnresolvedSpellings(app, ctx);
    expect(spellings.length).toBeGreaterThan(0);
    const pick = spellings[0];
    const [{ before }] = await admin.execute<{ before: number }>(sql`select count(*)::int as before from signals where property_id = ${propertyId} and location_method = 'none' and lower(coalesce(raw->>'Location', raw->>'Room')) = lower(${pick.typed})`);
    expect(before).toBe(pick.count);
    const target = (await getLocationByCode(app, ctx, "C-LIFT-1"))!;
    await expect(mapSpelling(app, ctx, staff, { spelling: pick.typed, locationId: target.id })).rejects.toBeInstanceOf(AuthorizationError);
    const res = await mapSpelling(app, ctx, gm, { spelling: pick.typed, locationId: target.id });
    expect(res.moved).toBe(pick.count);
    expect(res.code).toBe("C-LIFT-1");
    const after = (await getLocationByCode(app, ctx, "C-LIFT-1"))!;
    expect(after.aliases).toContain(pick.typed);
    const [{ moved }] = await admin.execute<{ moved: number }>(sql`select count(*)::int as moved from signals where location_id = ${target.id} and location_method = 'alias' and normalized->>'location_rule' = 'alias:settings'`);
    expect(moved).toBe(pick.count);
    expect((await listUnresolvedSpellings(app, ctx)).some((s) => s.typed === pick.typed)).toBe(false);
  });

  it("adds and removes aliases, and the resolver sees them on the next load", async () => {
    const room = (await getLocationByCode(app, ctx, "101"))!;
    const aliases = await addAlias(app, ctx, gm, { locationId: room.id, alias: "The Captain's Suite" });
    expect(aliases).toContain("The Captain's Suite");
    const rows = (await admin.select({ id: schema.locations.id, code: schema.locations.code, kind: schema.locations.kind, aliases: schema.locations.aliases, attributes: schema.locations.attributes }).from(schema.locations).where(eq(schema.locations.propertyId, propertyId))) as LocationRow[];
    const index = new LocationIndex(rows);
    const hit = inferLocation("the captain's suite", null, index);
    expect(hit?.code).toBe("101");
    const fewer = await removeAlias(app, ctx, gm, { locationId: room.id, alias: "The Captain's Suite" });
    expect(fewer).not.toContain("The Captain's Suite");
    await expect(addAlias(app, ctx, gm, { locationId: room.id, alias: "   " })).rejects.toThrow(/alias/);
  });

  it("sets what a piece of equipment serves and creates a new place", async () => {
    const pump = (await getLocationByCode(app, ctx, "B-PUMP"))!;
    const b = (await getLocationByCode(app, ctx, "B"))!;
    const spa = (await getLocationByCode(app, ctx, "SPA"))!;
    const n = await setServes(app, ctx, gm, { equipmentId: pump.id, servesIds: [b.id, spa.id] });
    expect(n).toBe(2);
    const after = (await getLocationByCode(app, ctx, "B-PUMP"))!;
    expect(after.serves.map((s) => s.code).sort()).toEqual(["B", "SPA"]);
    await expect(setServes(app, ctx, gm, { equipmentId: b.id, servesIds: [spa.id] })).rejects.toThrow(/equipment/);

    const { id } = await createLocation(app, ctx, gm, { kind: "facility", code: "KIDS-CLUB", name: "Kids club", parentId: null });
    const created = (await getLocationByCode(app, ctx, "KIDS-CLUB"))!;
    expect(created.id).toBe(id);
    expect(created.aliases).toContain("Kids club");
    await expect(createLocation(app, ctx, gm, { kind: "facility", code: "bad code!", name: "x" })).rejects.toThrow(/code/);
    await expect(createLocation(app, ctx, staff, { kind: "room", code: "999", name: "Room 999" })).rejects.toBeInstanceOf(AuthorizationError);
  });
});
