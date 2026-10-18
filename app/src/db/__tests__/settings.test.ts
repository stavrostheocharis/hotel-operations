import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, schema, withTenant, type Db, type TenantContext } from "../index";
import { findProperty } from "../scripts/seed";
import { hashPassword, verifyPassword } from "@/auth/password";
import { can } from "@/auth/permissions";
import { defaultDepartmentFor, getPropertyProfile, parseSettings, readSettings, recurrenceWindowDays } from "@/console/property-settings";
import { buildMonthlyReport, monthsBetween, renderMonthlyCsv } from "@/console/reports";
import { listUsers, timezoneOptions } from "@/console/settings";
import { buildIssue } from "@/link/issues";
import { linkSignals } from "@/link/pipeline";
import type { LinkSignal } from "@/link/types";
import { LocationIndex } from "@/normalize/location-rules";
import { createFakeLlm } from "@/normalize/llm";
import { TEST_APP_URL, TEST_URL } from "./env";

let admin: Db;
let app: Db;
let ctx: TenantContext;
let propertyId: string;
let groupId: string;

beforeAll(async () => {
  admin = createDb(TEST_URL, { max: 2 });
  app = createDb(TEST_APP_URL, { max: 2 });
  const p = await findProperty(admin);
  if (!p) throw new Error("seed missing");
  ctx = { groupId: p.groupId, propertyIds: [p.id] };
  propertyId = p.id;
  groupId = p.groupId;
  await linkSignals(admin, { llm: createFakeLlm() });
});

afterAll(async () => {
  await admin.update(schema.properties).set({ settings: {} }).where(eq(schema.properties.id, propertyId));
  await app.$client.end();
  await admin.$client.end();
});

describe("property settings", () => {
  it("parses what is stored and falls back to the built-in windows and departments", () => {
    expect(parseSettings(null)).toEqual({});
    expect(parseSettings({ recurrenceWindows: { plumbing: "45", bogus: 3, hvac: 0 }, defaultDepartments: { hvac: "engineering", noise: "nope" }, importTime: "06:10", junk: 1 })).toEqual({
      recurrenceWindows: { plumbing: 45 },
      defaultDepartments: { hvac: "engineering" },
      importTime: "06:10",
    });
    expect(recurrenceWindowDays("plumbing")).toBe(90);
    expect(recurrenceWindowDays("plumbing", { recurrenceWindows: { plumbing: 45 } })).toBe(45);
    expect(recurrenceWindowDays("furniture")).toBe(30);
    expect(defaultDepartmentFor("plumbing")).toBe("engineering");
    expect(defaultDepartmentFor("plumbing", { defaultDepartments: { plumbing: "housekeeping" } })).toBe("housekeeping");
    expect(defaultDepartmentFor(null)).toBeNull();
    expect(timezoneOptions("Europe/Athens")[0]).toBe("Europe/Athens");
  });

  it("the window decides whether a closure has held: resolved inside it, closed unverified after it", () => {
    const index = new LocationIndex([]);
    const day = (d: number) => new Date(Date.UTC(2026, 6, d, 12));
    const closedAt = day(1);
    const signal = (id: string, source: LinkSignal["source"], occurredAt: Date, wo?: { closedAt: Date | null }): LinkSignal =>
      ({ id, source, occurredAt, topic: "no_hot_water", category: "plumbing", locationId: null, locationCode: "263", locationKind: "room", text: "no hot water", wo: wo ? { status: "closed", closedAt: wo.closedAt, externalId: id, closureNote: null, reopened: false, assignedTo: null } : undefined }) as unknown as LinkSignal;
    const cluster = [signal("a", "front_desk", day(1)), signal("b", "work_order", day(1), { closedAt })];
    const asOf = day(20); // 19 days after the closure
    expect(buildIssue(cluster, [], index, asOf).status).toBe("resolved"); // plumbing: 90 days by default
    expect(buildIssue(cluster, [], index, asOf, { recurrenceWindows: { plumbing: 10 } }).status).toBe("closed_unverified");
    expect(buildIssue(cluster, [], index, asOf, { recurrenceWindows: { plumbing: 10 } }).recurrenceWindowDays).toBe(10);
  });

  it("is read and written through the app role, and the linker picks it up at the next run", async () => {
    await withTenant(app, ctx, (tx) => tx.update(schema.properties).set({ settings: { recurrenceWindows: { plumbing: 5 }, importTime: "06:10" } }).where(eq(schema.properties.id, propertyId)));
    const profile = (await getPropertyProfile(app, ctx, propertyId))!;
    expect(profile.settings).toEqual({ recurrenceWindows: { plumbing: 5 }, importTime: "06:10" });
    expect(await readSettings(admin, propertyId)).toEqual(profile.settings);
    const before = await admin.execute<{ n: number }>(sql`select count(*)::int as n from issues where property_id = ${propertyId} and category = 'plumbing' and recurrence_window_days = 5`);
    await linkSignals(admin, { llm: createFakeLlm() });
    const after = await admin.execute<{ n: number }>(sql`select count(*)::int as n from issues where property_id = ${propertyId} and category = 'plumbing' and recurrence_window_days = 5`);
    expect(Number(before[0].n)).toBe(0);
    expect(Number(after[0].n)).toBeGreaterThan(0);
    await withTenant(app, ctx, (tx) => tx.update(schema.properties).set({ settings: {} }).where(eq(schema.properties.id, propertyId)));
    await linkSignals(admin, { llm: createFakeLlm() });
  });
});

describe("users and roles", () => {
  it("a GM may manage everyone but group admins; a group admin everyone; staff nobody", () => {
    const gm = { userId: "x", role: "gm" as const, department: null };
    expect(can(gm, "settings.users", { targetRole: "staff" })).toBe(true);
    expect(can(gm, "settings.users", { targetRole: "gm" })).toBe(true);
    expect(can(gm, "settings.users", { targetRole: "group_admin" })).toBe(false);
    expect(can({ ...gm, role: "group_admin" }, "settings.users", { targetRole: "group_admin" })).toBe(true);
    expect(can({ ...gm, role: "dept_head" }, "settings.users", { targetRole: "staff" })).toBe(false);
  });

  it("lists the property's people with their access, and a new user created through the app role can sign in", async () => {
    const before = await listUsers(app, ctx, propertyId);
    expect(before.find((u) => u.email === "gm@demo.hotel")?.member).toBe(true);
    expect(before.find((u) => u.email === "admin@demo.hotel")?.member).toBe(false);
    expect(before[0].role).toBe("group_admin");

    const hash = await hashPassword("a-first-password-1");
    const id = await withTenant(app, ctx, async (tx) => {
      const [u] = await tx.insert(schema.users).values({ groupId, email: "newcomer@demo.hotel", name: "Nikos New", role: "staff", department: "housekeeping" }).returning({ id: schema.users.id });
      await tx.insert(schema.memberships).values({ groupId, propertyId, userId: u.id });
      await tx.execute(sql`select auth_set_password(${u.id}, ${hash})`);
      return u.id;
    });
    const after = await listUsers(app, ctx, propertyId);
    const row = after.find((u) => u.id === id)!;
    expect(row.member).toBe(true);
    expect(row.department).toBe("housekeeping");
    const [cred] = await withTenant(app, ctx, (tx) => tx.execute<{ password_hash: string; is_active: boolean }>(sql`select * from auth_credentials('newcomer@demo.hotel')`));
    expect(await verifyPassword("a-first-password-1", cred.password_hash)).toBe(true);

    // removing access and deactivating, as the actions do
    await withTenant(app, ctx, async (tx) => {
      await tx.delete(schema.memberships).where(eq(schema.memberships.userId, id));
      await tx.update(schema.users).set({ isActive: false }).where(eq(schema.users.id, id));
    });
    const gone = (await listUsers(app, ctx, propertyId)).find((u) => u.id === id)!;
    expect(gone.member).toBe(false);
    expect(gone.isActive).toBe(false);
    expect((await listUsers(app, ctx, propertyId)).at(-1)?.id).toBe(id);
    await admin.execute(sql`delete from user_credentials where user_id = ${id}`);
    await admin.delete(schema.users).where(eq(schema.users.id, id));
  });
});

describe("the monthly report", () => {
  it("covers every month of the season, adds up, and matches the raw counts", async () => {
    const r = await buildMonthlyReport(app, ctx);
    expect(r.months.map((m) => m.month)).toEqual(monthsBetween(r.season.from, r.season.to));
    expect(r.months.length).toBeGreaterThanOrEqual(6);
    const sum = (f: (m: (typeof r.months)[number]) => number) => r.months.reduce((n, m) => n + f(m), 0);
    expect(sum((m) => m.records)).toBe(r.totals.records);
    expect(sum((m) => m.issuesOpened)).toBe(r.totals.issuesOpened);
    expect(sum((m) => m.closures)).toBe(r.totals.closures);
    expect(r.byCategory.reduce((n, c) => n + c.issues, 0)).toBe(r.totals.issuesOpened);
    const [raw] = await withTenant(app, ctx, (tx) => tx.execute<{ n: number }>(sql`select count(*)::int as n from signals where source <> 'pms'`));
    expect(r.totals.records).toBeLessThanOrEqual(Number(raw.n));
    expect(r.totals.records).toBeGreaterThan(Number(raw.n) * 0.9);
    expect(r.totals.roomNights).toBeGreaterThan(0);
    expect(r.totals.repeatsPerThousandRoomNights).not.toBeNull();
    expect(r.totals.held30 + r.months.length).toBeGreaterThan(0);
    const csv = renderMonthlyCsv(r);
    expect(csv.startsWith("﻿month;records;")).toBe(true);
    expect(csv.split("\r\n").filter(Boolean).length).toBe(1 + r.months.length + 1 + 1 + r.byCategory.length);
    const narrow = await buildMonthlyReport(app, ctx, { from: r.season.from, to: `${r.season.from.slice(0, 7)}-28` });
    expect(narrow.months.length).toBe(1);
    expect(narrow.totals.records).toBeLessThan(r.totals.records);
  });
});
