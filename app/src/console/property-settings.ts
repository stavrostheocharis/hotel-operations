import { eq, sql } from "drizzle-orm";
import { schema, withTenant, type Db, type TenantContext } from "@/db";
import { CATEGORIES, type Category } from "@/normalize/taxonomy";

/**
 * What a property can tune without code: how long a closure must hold
 * before a problem counts as back (per category), which department a
 * category's problems go to by default, and when the nightly export is
 * expected. Stored in `properties.settings`; the linker reads the windows
 * at every run.
 */
export type Department = (typeof schema.department.enumValues)[number];

export type PropertySettings = {
  recurrenceWindows?: Partial<Record<Category, number>>;
  defaultDepartments?: Partial<Record<Category, Department>>;
  /** "06:10", property-local. */
  importTime?: string;
  /** Column corrections a person made on an earlier import, applied to every new check: dataset → field → column. */
  mappingOverrides?: Partial<Record<string, Record<string, string>>>;
};

/** The linker's built-in windows; everything else is 30 days. */
export const DEFAULT_RECURRENCE_WINDOWS: Partial<Record<Category, number>> = { plumbing: 90, hvac: 60, housekeeping: 7, fnb_service: 14, facilities: 30 };
export const FALLBACK_WINDOW_DAYS = 30;

export const DEFAULT_DEPARTMENTS: Partial<Record<Category, Department>> = {
  hvac: "engineering",
  plumbing: "engineering",
  electrical: "engineering",
  locks_doors: "engineering",
  elevator: "engineering",
  appliance: "engineering",
  facilities: "engineering",
  safety: "engineering",
  furniture: "engineering",
  it_network: "it",
  it_tv: "it",
  housekeeping: "housekeeping",
  pest: "housekeeping",
  fnb_service: "fb",
  noise: "front_office",
  service: "front_office",
  request: "front_office",
};

export function recurrenceWindowDays(category: string | null | undefined, settings: PropertySettings | null = null): number {
  const c = category as Category | undefined;
  return (c && settings?.recurrenceWindows?.[c]) ?? (c && DEFAULT_RECURRENCE_WINDOWS[c]) ?? FALLBACK_WINDOW_DAYS;
}

export function defaultDepartmentFor(category: string | null | undefined, settings: PropertySettings | null = null): Department | null {
  const c = category as Category | undefined;
  return (c && settings?.defaultDepartments?.[c]) ?? (c && DEFAULT_DEPARTMENTS[c]) ?? null;
}

/** Accepts whatever is in the column; unknown keys and bad values are dropped. */
export function parseSettings(raw: unknown): PropertySettings {
  const out: PropertySettings = {};
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;
  if (r.recurrenceWindows && typeof r.recurrenceWindows === "object") {
    out.recurrenceWindows = {};
    for (const [k, v] of Object.entries(r.recurrenceWindows as Record<string, unknown>)) {
      const n = Number(v);
      if ((CATEGORIES as readonly string[]).includes(k) && Number.isInteger(n) && n >= 1 && n <= 365) out.recurrenceWindows[k as Category] = n;
    }
  }
  if (r.defaultDepartments && typeof r.defaultDepartments === "object") {
    out.defaultDepartments = {};
    for (const [k, v] of Object.entries(r.defaultDepartments as Record<string, unknown>)) {
      if ((CATEGORIES as readonly string[]).includes(k) && typeof v === "string" && (schema.department.enumValues as readonly string[]).includes(v)) out.defaultDepartments[k as Category] = v as Department;
    }
  }
  if (typeof r.importTime === "string" && /^\d{2}:\d{2}$/.test(r.importTime)) out.importTime = r.importTime;
  if (r.mappingOverrides && typeof r.mappingOverrides === "object") {
    out.mappingOverrides = {};
    for (const [ds, fields] of Object.entries(r.mappingOverrides as Record<string, unknown>)) {
      if (!fields || typeof fields !== "object") continue;
      const clean: Record<string, string> = {};
      for (const [f, c] of Object.entries(fields as Record<string, unknown>)) if (typeof c === "string") clean[f] = c;
      if (Object.keys(clean).length) out.mappingOverrides[ds] = clean;
    }
  }
  return out;
}

export type PropertyProfile = {
  id: string;
  code: string;
  name: string;
  timezone: string;
  seasonOpen: string | null;
  seasonClose: string | null;
  settings: PropertySettings;
};

export async function getPropertyProfile(db: Db, ctx: TenantContext, propertyId: string): Promise<PropertyProfile | null> {
  return withTenant(db, ctx, async (tx) => {
    const [r] = await tx.execute<{ id: string; code: string; name: string; timezone: string; season_open: string | null; season_close: string | null; settings: unknown }>(
      sql`select id, code, name, timezone, season_open::text, season_close::text, settings from properties where id = ${propertyId}`,
    );
    return r ? { id: r.id, code: r.code, name: r.name, timezone: r.timezone, seasonOpen: r.season_open, seasonClose: r.season_close, settings: parseSettings(r.settings) } : null;
  });
}

/** Without a tenant: the worker and the linker read as admin. */
export async function readSettings(db: Db, propertyId: string): Promise<PropertySettings> {
  const [r] = await db.select({ settings: schema.properties.settings }).from(schema.properties).where(eq(schema.properties.id, propertyId));
  return parseSettings(r?.settings);
}
