import "server-only";

import { sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";
import { getAppDb } from "@/db";
import type { Department, Role } from "./permissions";
import { hashToken } from "./tokens";

export { hashToken, newSessionToken } from "./tokens";

/**
 * Database-backed sessions behind an opaque HttpOnly cookie. The cookie holds
 * a random token; the database holds its sha256. Reads go through
 * auth_resolve_session(), a SECURITY DEFINER function (migration 0006), so
 * the app role never selects from users or sessions before a tenant context
 * exists. Expiry slides: the function extends a session seen again after
 * 15 minutes.
 */
export const SESSION_COOKIE = "oem_session";
export const PROPERTY_COOKIE = "oem_property";
export const SESSION_DAYS = 30;

export type Session = {
  sessionId: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: Role;
    department: Department | null;
    locale: string;
  };
  groupId: string;
  /** Every property the user may see: all of the group's for group_admin, else memberships. */
  propertyIds: string[];
  /** Per-property role overrides from memberships. */
  propertyRoles: Record<string, Role>;
  expiresAt: Date;
};

export async function resolveSession(token: string): Promise<Session | null> {
  const [row] = await getAppDb().execute<{
    session_id: string;
    user_id: string;
    group_id: string;
    email: string;
    name: string;
    role: Role;
    department: Department | null;
    locale: string;
    expires_at: Date;
    property_ids: string[];
    property_roles: Record<string, Role>;
  }>(sql`select * from auth_resolve_session(${hashToken(token)})`);
  if (!row) return null;
  return {
    sessionId: row.session_id,
    user: { id: row.user_id, email: row.email, name: row.name, role: row.role, department: row.department, locale: row.locale },
    groupId: row.group_id,
    propertyIds: row.property_ids ?? [],
    propertyRoles: row.property_roles ?? {},
    expiresAt: new Date(row.expires_at),
  };
}

/** The current request's session, read once per request (React.cache). Must be called inside a Suspense boundary. */
export const getSession = cache(async (): Promise<Session | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return resolveSession(token);
});

/** The property the user last chose, when the cookie names one they may see. */
export const getSelectedPropertyId = cache(async (): Promise<string | null> => {
  return (await cookies()).get(PROPERTY_COOKIE)?.value ?? null;
});

export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production" || process.env.SESSION_COOKIE_SECURE === "true",
    path: "/",
    expires,
  };
}
