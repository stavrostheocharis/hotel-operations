import "server-only";

import { inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getAppDb, schema, withTenant, type TenantContext } from "@/db";
import { can, type Capability, type CapabilityContext, type Department, type Role } from "./permissions";
import { getSelectedPropertyId, getSession, type Session } from "./session";

/**
 * The signed-in person as every page and action sees them: who they are,
 * which properties they may see (`tenant`), which one is selected
 * (`property`, `scoped`), and what they may do (`can`). Resolved once per
 * request; must be read inside a Suspense boundary (it reads cookies).
 */
export type PropertySummary = { id: string; code: string; name: string; timezone: string };

export type Viewer = {
  user: Session["user"];
  /** Every property the user may see. Entity pages read with this. */
  tenant: TenantContext;
  /** The selected property only. Lists and KPIs read with this. */
  scoped: TenantContext;
  property: PropertySummary;
  properties: PropertySummary[];
  roleAt(propertyId?: string): Role;
  can(cap: Capability, ctx?: CapabilityContext): boolean;
  actor(propertyId?: string): { userId: string; role: Role; department: Department | null };
};

export const getViewer = cache(async (): Promise<Viewer | null> => {
  const session = await getSession();
  if (!session || session.propertyIds.length === 0) return null;
  const tenant: TenantContext = { groupId: session.groupId, propertyIds: session.propertyIds };
  const properties = await withTenant(getAppDb(), tenant, (tx) =>
    tx
      .select({ id: schema.properties.id, code: schema.properties.code, name: schema.properties.name, timezone: schema.properties.timezone })
      .from(schema.properties)
      .where(inArray(schema.properties.id, session.propertyIds))
      .orderBy(schema.properties.code),
  );
  if (properties.length === 0) return null;
  const chosen = await getSelectedPropertyId();
  const property = properties.find((p) => p.id === chosen) ?? properties[0];
  const roleAt = (propertyId: string = property.id): Role => session.propertyRoles[propertyId] ?? session.user.role;
  const actor = (propertyId?: string) => ({ userId: session.user.id, role: roleAt(propertyId), department: session.user.department });
  return {
    user: session.user,
    tenant,
    scoped: { groupId: session.groupId, propertyIds: [property.id] },
    property,
    properties,
    roleAt,
    actor,
    can: (cap, ctx) => can(actor(), cap, ctx),
  };
});

/** The viewer, or a redirect to sign-in. Pages call this inside their Suspense boundary; actions call it first. */
export async function requireViewer(next?: string): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect(next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in");
  return viewer;
}
