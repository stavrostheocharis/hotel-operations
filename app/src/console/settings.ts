import { sql } from "drizzle-orm";
import { ROLE_ORDER, type Role } from "@/auth/permissions";
import { withTenant, type Db, type TenantContext } from "@/db";

/** Who can sign in at this property, and what they may do. */
export type UserRow = {
  id: string;
  email: string;
  name: string;
  role: Role;
  department: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  /** A membership at the selected property; group admins have access everywhere. */
  member: boolean;
  /** The membership's role override, if any. */
  propertyRole: Role | null;
};

export async function listUsers(db: Db, ctx: TenantContext, propertyId: string): Promise<UserRow[]> {
  return withTenant(db, ctx, async (tx) => {
    const rows = await tx.execute<{ id: string; email: string; name: string; role: Role; department: string | null; is_active: boolean; last_login_at: Date | null; member: boolean; property_role: Role | null }>(sql`
      select u.id, u.email, u.name, u.role::text as role, u.department::text as department, u.is_active, u.last_login_at,
             (m.id is not null) as member, m.role::text as property_role
      from users u left join memberships m on m.user_id = u.id and m.property_id = ${propertyId}
      order by u.is_active desc, u.name
    `);
    return rows
      .map((r) => ({ id: r.id, email: r.email, name: r.name, role: r.role, department: r.department, isActive: r.is_active, lastLoginAt: r.last_login_at ? new Date(r.last_login_at) : null, member: Boolean(r.member), propertyRole: r.property_role }))
      .sort((a, b) => Number(b.isActive) - Number(a.isActive) || ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name));
  });
}

export function timezoneOptions(current: string): string[] {
  const all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  const set = new Set<string>([current, "Europe/Athens", "Europe/Nicosia", "Europe/London", "Europe/Berlin", "Europe/Rome", "Europe/Madrid", "Europe/Paris", "Europe/Istanbul", "Asia/Dubai", "UTC", ...all]);
  return [...set];
}

export function isTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
