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

/**
 * The people of this property: everyone with a membership here, plus the
 * group admins (who have access everywhere). A group admin asking with
 * `everyone` sees the whole group, members elsewhere included.
 */
export async function listUsers(db: Db, ctx: TenantContext, propertyId: string, opts: { everyone?: boolean } = {}): Promise<UserRow[]> {
  return withTenant(db, ctx, async (tx) => {
    const rows = await tx.execute<{ id: string; email: string; name: string; role: Role; department: string | null; is_active: boolean; last_login_at: Date | null; member: boolean; property_role: Role | null }>(sql`
      select u.id, u.email, u.name, u.role::text as role, u.department::text as department, u.is_active, u.last_login_at,
             (m.id is not null) as member, m.role::text as property_role
      from users u left join memberships m on m.user_id = u.id and m.property_id = ${propertyId}
      where ${opts.everyone ? sql`true` : sql`(m.id is not null or u.role = 'group_admin')`}
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

/**
 * Whether a user is someone this property's management may act on: a
 * member here, or a group admin (whom only a group admin may touch, which
 * `settings.users` checks separately). Group admins act on the whole group.
 */
export async function userInScope(db: Db, ctx: TenantContext, propertyId: string, userId: string, groupWide: boolean): Promise<boolean> {
  if (groupWide) return true;
  return withTenant(db, ctx, async (tx) => {
    const [r] = await tx.execute<{ ok: boolean }>(sql`
      select exists (select 1 from memberships where user_id = ${userId} and property_id = ${propertyId})
          or exists (select 1 from users where id = ${userId} and role = 'group_admin') as ok
    `);
    return Boolean(r?.ok);
  });
}
