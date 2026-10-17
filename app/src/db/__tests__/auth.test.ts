import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../index";
import { DEMO_USERS } from "../scripts/seed";
import { hashPassword, verifyPassword } from "@/auth/password";
import { hashToken, newSessionToken } from "@/auth/tokens";
import { TEST_APP_URL, TEST_PASSWORD, TEST_URL } from "./env";
import { expectDbError } from "./helpers";

let admin: Db;
let app: Db;

type Resolved = {
  session_id: string;
  user_id: string;
  group_id: string;
  email: string;
  role: string;
  department: string | null;
  property_ids: string[];
  property_roles: Record<string, string>;
  expires_at: Date;
};

const credentials = (email: string) =>
  app.execute<{ user_id: string; group_id: string; is_active: boolean; password_hash: string }>(sql`select * from auth_credentials(${email})`);

async function openSession(userId: string, expiresInMs = 86_400_000): Promise<string> {
  const token = newSessionToken();
  const expires = new Date(Date.now() + expiresInMs).toISOString();
  await app.execute(sql`select auth_create_session(${userId}, ${hashToken(token)}, ${expires}::timestamptz, 'vitest')`);
  return token;
}

const resolve = (token: string) => app.execute<Resolved>(sql`select * from auth_resolve_session(${hashToken(token)})`);

beforeAll(() => {
  admin = createDb(TEST_URL, { max: 1 });
  app = createDb(TEST_APP_URL, { max: 2 });
});

afterAll(async () => {
  await app.$client.end();
  await admin.$client.end();
});

describe("sign-in through the app role", () => {
  it("seeded one user per role with a password that verifies", async () => {
    expect(DEMO_USERS.map((u) => u.role)).toEqual(["group_admin", "gm", "dept_head", "dept_head", "supervisor", "staff", "readonly"]);
    const [gm] = await credentials("GM@demo.hotel");
    expect(gm).toBeDefined();
    expect(gm.is_active).toBe(true);
    expect(await verifyPassword(TEST_PASSWORD, gm.password_hash)).toBe(true);
    expect(await verifyPassword("not it", gm.password_hash)).toBe(false);
    expect((await credentials("nobody@demo.hotel")).length).toBe(0);
  });

  it("cannot read the sign-in tables directly", async () => {
    await expectDbError(app.execute(sql`select count(*) from sessions`), /permission denied/);
    await expectDbError(app.execute(sql`select count(*) from user_credentials`), /permission denied/);
  });

  it("resolves a session into the tenant context, per role", async () => {
    const [gm] = await credentials("gm@demo.hotel");
    const gmToken = await openSession(gm.user_id);
    const [g] = await resolve(gmToken);
    expect(g.email).toBe("gm@demo.hotel");
    expect(g.role).toBe("gm");
    expect(g.property_ids.length).toBe(1);
    expect(g.property_roles).toEqual({});
    expect(new Date(g.expires_at).getTime()).toBeGreaterThan(Date.now());

    const [adminCred] = await credentials("admin@demo.hotel");
    const [a] = await resolve(await openSession(adminCred.user_id));
    expect(a.role).toBe("group_admin");
    // Every property of the group, which includes the one the GM is a member of.
    expect(a.property_ids.length).toBeGreaterThanOrEqual(g.property_ids.length);
    expect(a.property_ids).toContain(g.property_ids[0]);

    expect((await resolve("not-a-token")).length).toBe(0);
  });

  it("ignores expired sessions and forgets deleted ones", async () => {
    const [staff] = await credentials("staff@demo.hotel");
    const expired = await openSession(staff.user_id, -60_000);
    expect((await resolve(expired)).length).toBe(0);
    const live = await openSession(staff.user_id);
    expect((await resolve(live)).length).toBe(1);
    await app.execute(sql`select auth_delete_session(${hashToken(live)})`);
    expect((await resolve(live)).length).toBe(0);
  });

  it("a new password ends every session of that user", async () => {
    const [ro] = await credentials("readonly@demo.hotel");
    const token = await openSession(ro.user_id);
    expect((await resolve(token)).length).toBe(1);
    await app.execute(sql`select auth_set_password(${ro.user_id}, ${await hashPassword("another-password-1")})`);
    expect((await resolve(token)).length).toBe(0);
    const [after] = await credentials("readonly@demo.hotel");
    expect(await verifyPassword("another-password-1", after.password_hash)).toBe(true);
    await app.execute(sql`select auth_set_password(${ro.user_id}, ${await hashPassword(TEST_PASSWORD)})`);
  });

  it("a deactivated user keeps credentials but no session resolves", async () => {
    const [sup] = await credentials("supervisor@demo.hotel");
    const token = await openSession(sup.user_id);
    await admin.execute(sql`update users set is_active = false where id = ${sup.user_id}`);
    try {
      expect((await resolve(token)).length).toBe(0);
      const [c] = await credentials("supervisor@demo.hotel");
      expect(c.is_active).toBe(false);
    } finally {
      await admin.execute(sql`update users set is_active = true where id = ${sup.user_id}`);
    }
  });
});
