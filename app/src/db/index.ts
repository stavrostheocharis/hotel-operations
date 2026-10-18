import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export { schema };

export type Db = ReturnType<typeof createDb>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** The tenant a request acts for. RLS policies read exactly these two values. */
export type TenantContext = {
  groupId: string;
  propertyIds: string[];
};

export function createDb(url: string, opts: { max?: number } = {}) {
  const client = postgres(url, {
    max: opts.max ?? 10,
    // The migrations raise NOTICEs for idempotent role creation; keep logs quiet.
    onnotice: () => {},
  });
  return drizzle(client, { schema });
}

/**
 * Run `fn` inside a transaction with the tenant context set. Every query
 * inside sees only rows for that group and those properties (and can only
 * write such rows), enforced by Postgres row-level security, not by the app.
 *
 * Use this with the app connection (DATABASE_URL_APP). The superuser /
 * migrator connection bypasses RLS and must never serve user requests.
 */
export async function withTenant<T>(
  db: Db,
  ctx: TenantContext,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  if (!ctx.groupId) throw new Error("withTenant: groupId is required");
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.group_id', ${ctx.groupId}, true),
                 set_config('app.property_ids', ${ctx.propertyIds.join(",")}, true)`,
    );
    return fn(tx);
  });
}

let appDb: Db | undefined;
let adminDb: Db | undefined;

/** Connection for user-facing code. Row-level security applies. */
export function getAppDb(): Db {
  if (!appDb) {
    const url = process.env.DATABASE_URL_APP;
    if (!url) throw new Error("DATABASE_URL_APP is not set");
    assertNotDefaultPassword(url, "DATABASE_URL_APP");
    appDb = createDb(url);
  }
  return appDb;
}

/** Connection for migrations, seeds and loaders. Bypasses row-level security. */
export function getAdminDb(): Db {
  if (!adminDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    assertNotDefaultPassword(url, "DATABASE_URL");
    adminDb = createDb(url);
  }
  return adminDb;
}

/**
 * Migration 0002 creates the database roles with their own names as
 * passwords so a checkout works at once; a production deployment must have
 * rotated them (docs/deploy.md). Refuse to start otherwise.
 */
export function assertNotDefaultPassword(url: string, name: string): void {
  if (process.env.NODE_ENV !== "production") return;
  if (/\/\/(app_user:app_user|app_migrator:app_migrator|pii_admin:pii_admin|postgres:postgres)@/.test(url)) {
    throw new Error(`${name} uses the development password; rotate the role's password before running in production`);
  }
}
