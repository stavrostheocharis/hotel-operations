"use server";

import { and, eq, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { assertCan, AuthorizationError, type Role } from "@/auth/permissions";
import { hashPassword, passwordProblem } from "@/auth/password";
import { requireViewer } from "@/auth/viewer";
import { getAppDb, schema, withTenant } from "@/db";
import { t } from "@/i18n";
import { CATEGORIES, type Category } from "@/normalize/taxonomy";
import type { ActionResult } from "./issue-actions";
import { parseSettings, type Department, type PropertySettings } from "./property-settings";
import { isTimezone, userInScope } from "./settings";
import { failureMessage } from "./action-errors";

/**
 * Settings → Property, Categories, Users. Every action re-authenticates and
 * checks the capability; `settings.users` also takes the role in question,
 * so a GM never touches a group admin.
 */
const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const ROLES = schema.userRole.enumValues as readonly string[];
const DEPARTMENTS = schema.department.enumValues as readonly string[];

async function run(fn: () => Promise<string>): Promise<ActionResult> {
  try {
    const message = await fn();
    refresh();
    return { ok: true, message, at: Date.now() };
  } catch (err) {
    if (err instanceof Error && /users_email_unique|duplicate key/.test(err.message)) return { ok: false, message: t("settings.users.errors.emailTaken"), at: Date.now() };
    return { ok: false, message: failureMessage(err), at: Date.now() };
  }
}

export async function updatePropertyAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    assertCan(viewer.actor(), "settings.property");
    const name = str(fd, "name");
    const timezone = str(fd, "timezone");
    const seasonOpen = str(fd, "seasonOpen") || null;
    const seasonClose = str(fd, "seasonClose") || null;
    const importTime = str(fd, "importTime");
    if (!name) throw new Error(t("settings.property.errors.name"));
    if (!isTimezone(timezone)) throw new Error(t("settings.property.errors.timezone"));
    for (const d of [seasonOpen, seasonClose]) if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(t("settings.property.errors.date"));
    if (seasonOpen && seasonClose && seasonClose < seasonOpen) throw new Error(t("settings.property.errors.season"));
    if (importTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(importTime)) throw new Error(t("settings.property.errors.time"));
    await withTenant(getAppDb(), viewer.scoped, async (tx) => {
      const [p] = await tx.select({ settings: schema.properties.settings }).from(schema.properties).where(eq(schema.properties.id, viewer.property.id));
      const settings: PropertySettings = { ...parseSettings(p?.settings), importTime: importTime || undefined };
      await tx.update(schema.properties).set({ name, timezone, seasonOpen, seasonClose, settings: settings as Record<string, unknown> }).where(eq(schema.properties.id, viewer.property.id));
      await tx.insert(schema.events).values({ groupId: viewer.scoped.groupId, propertyId: viewer.property.id, entityType: "property", entityId: viewer.property.id, type: "property.settings_changed", actor: viewer.user.id, payload: { name, timezone, season_open: seasonOpen, season_close: seasonClose, import_time: importTime || null } });
    });
    return t("settings.property.toast.saved");
  });
}

export async function updateCategoriesAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    assertCan(viewer.actor(), "settings.property");
    const recurrenceWindows: Partial<Record<Category, number>> = {};
    const defaultDepartments: Partial<Record<Category, Department>> = {};
    for (const c of CATEGORIES) {
      const w = str(fd, `window_${c}`);
      if (w) {
        const n = Number(w);
        if (!Number.isInteger(n) || n < 1 || n > 365) throw new Error(t("settings.categories.errors.window", { category: c }));
        recurrenceWindows[c] = n;
      }
      const d = str(fd, `dept_${c}`);
      if (d && d !== "none") {
        if (!DEPARTMENTS.includes(d)) throw new Error("unknown department");
        defaultDepartments[c] = d as Department;
      }
    }
    await withTenant(getAppDb(), viewer.scoped, async (tx) => {
      const [p] = await tx.select({ settings: schema.properties.settings }).from(schema.properties).where(eq(schema.properties.id, viewer.property.id));
      const settings: PropertySettings = { ...parseSettings(p?.settings), recurrenceWindows, defaultDepartments };
      await tx.update(schema.properties).set({ settings: settings as Record<string, unknown> }).where(eq(schema.properties.id, viewer.property.id));
      await tx.insert(schema.events).values({ groupId: viewer.scoped.groupId, propertyId: viewer.property.id, entityType: "property", entityId: viewer.property.id, type: "property.settings_changed", actor: viewer.user.id, payload: { recurrence_windows: recurrenceWindows, default_departments: defaultDepartments } });
    });
    return t("settings.categories.toast.saved");
  });
}

function roleOf(v: string): Role {
  if (!ROLES.includes(v)) throw new Error("unknown role");
  return v as Role;
}
function departmentOf(v: string): Department | null {
  if (!v || v === "none") return null;
  if (!DEPARTMENTS.includes(v)) throw new Error("unknown department");
  return v as Department;
}

export async function addUserAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    const role = roleOf(str(fd, "role"));
    assertCan(viewer.actor(), "settings.users", { targetRole: role });
    const name = str(fd, "name");
    const email = str(fd, "email").toLowerCase();
    const department = departmentOf(str(fd, "department"));
    const password = str(fd, "password");
    if (!name) throw new Error(t("settings.users.errors.name"));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(t("settings.users.errors.email"));
    const problem = passwordProblem(password);
    if (problem) throw new Error(problem);
    const hash = await hashPassword(password);
    await withTenant(getAppDb(), viewer.scoped, async (tx) => {
      const [u] = await tx.insert(schema.users).values({ groupId: viewer.scoped.groupId, email, name, role, department, isActive: true }).returning({ id: schema.users.id });
      if (role !== "group_admin") await tx.insert(schema.memberships).values({ groupId: viewer.scoped.groupId, propertyId: viewer.property.id, userId: u.id });
      await tx.execute(sql`select auth_set_password(${u.id}, ${hash})`);
      await tx.insert(schema.events).values({ groupId: viewer.scoped.groupId, propertyId: viewer.property.id, entityType: "user", entityId: u.id, type: "user.created", actor: viewer.user.id, payload: { role, department, email } });
    });
    return t("settings.users.toast.added", { name });
  });
}

/** The user an action is about: they must be in this property's scope for anyone but a group admin. */
async function loadTarget(viewer: { scoped: { groupId: string; propertyIds: string[] }; property: { id: string }; roleAt: () => string }, userId: string) {
  const [u] = await withTenant(getAppDb(), viewer.scoped, (tx) => tx.select({ id: schema.users.id, name: schema.users.name, role: schema.users.role, isActive: schema.users.isActive }).from(schema.users).where(eq(schema.users.id, userId)));
  if (!u) throw new Error("user not found");
  if (!(await userInScope(getAppDb(), viewer.scoped, viewer.property.id, userId, viewer.roleAt() === "group_admin"))) throw new AuthorizationError("settings.users");
  return u;
}

export async function updateUserAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    const userId = str(fd, "userId");
    const target = await loadTarget(viewer, userId);
    const role = roleOf(str(fd, "role"));
    assertCan(viewer.actor(), "settings.users", { targetRole: target.role });
    assertCan(viewer.actor(), "settings.users", { targetRole: role });
    if (userId === viewer.user.id && role !== viewer.user.role) throw new Error(t("settings.users.errors.self"));
    const department = departmentOf(str(fd, "department"));
    await withTenant(getAppDb(), viewer.scoped, async (tx) => {
      await tx.update(schema.users).set({ role, department }).where(eq(schema.users.id, userId));
      await tx.insert(schema.events).values({ groupId: viewer.scoped.groupId, propertyId: viewer.property.id, entityType: "user", entityId: userId, type: "user.updated", actor: viewer.user.id, payload: { role, department, previous_role: target.role } });
    });
    return t("settings.users.toast.updated", { name: target.name });
  });
}

export async function resetPasswordAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    const userId = str(fd, "userId");
    const target = await loadTarget(viewer, userId);
    assertCan(viewer.actor(), "settings.users", { targetRole: target.role });
    const password = str(fd, "password");
    const problem = passwordProblem(password);
    if (problem) throw new Error(problem);
    const hash = await hashPassword(password);
    await withTenant(getAppDb(), viewer.scoped, async (tx) => {
      await tx.execute(sql`select auth_set_password(${userId}, ${hash})`);
      await tx.insert(schema.events).values({ groupId: viewer.scoped.groupId, propertyId: viewer.property.id, entityType: "user", entityId: userId, type: "user.updated", actor: viewer.user.id, payload: { password_reset: true } });
    });
    return t("settings.users.toast.passwordReset", { name: target.name });
  });
}

export async function setAccessAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    const userId = str(fd, "userId");
    const grant = str(fd, "grant") === "1";
    const target = await loadTarget(viewer, userId);
    assertCan(viewer.actor(), "settings.users", { targetRole: target.role });
    if (userId === viewer.user.id && !grant) throw new Error(t("settings.users.errors.self"));
    await withTenant(getAppDb(), viewer.scoped, async (tx) => {
      if (grant) await tx.insert(schema.memberships).values({ groupId: viewer.scoped.groupId, propertyId: viewer.property.id, userId }).onConflictDoNothing();
      else await tx.delete(schema.memberships).where(and(eq(schema.memberships.userId, userId), eq(schema.memberships.propertyId, viewer.property.id)));
      await tx.insert(schema.events).values({ groupId: viewer.scoped.groupId, propertyId: viewer.property.id, entityType: "user", entityId: userId, type: "user.updated", actor: viewer.user.id, payload: { access: grant ? "granted" : "removed" } });
    });
    return grant ? t("settings.users.toast.accessGranted", { name: target.name }) : t("settings.users.toast.accessRemoved", { name: target.name });
  });
}

export async function setActiveAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    const userId = str(fd, "userId");
    const active = str(fd, "active") === "1";
    const target = await loadTarget(viewer, userId);
    assertCan(viewer.actor(), "settings.users", { targetRole: target.role });
    if (userId === viewer.user.id) throw new Error(t("settings.users.errors.self"));
    await withTenant(getAppDb(), viewer.scoped, async (tx) => {
      await tx.update(schema.users).set({ isActive: active }).where(eq(schema.users.id, userId));
      await tx.insert(schema.events).values({ groupId: viewer.scoped.groupId, propertyId: viewer.property.id, entityType: "user", entityId: userId, type: active ? "user.updated" : "user.deactivated", actor: viewer.user.id, payload: { is_active: active } });
    });
    return active ? t("settings.users.toast.reactivated", { name: target.name }) : t("settings.users.toast.deactivated", { name: target.name });
  });
}
