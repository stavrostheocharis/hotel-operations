import type { TenantContext } from "@/db";
import { requireViewer } from "@/auth/viewer";

/**
 * Which property the console is showing: the signed-in viewer's selected
 * property. Kept as a thin wrapper so the read models written before sign-in
 * existed keep their call shape; new code should use the viewer directly.
 * Reads cookies, so call it inside a Suspense boundary.
 */
export type CurrentTenant = TenantContext & {
  propertyId: string;
  code: string;
  name: string;
  timezone: string;
};

export async function getCurrentTenant(): Promise<CurrentTenant> {
  const v = await requireViewer();
  return { ...v.scoped, propertyId: v.property.id, code: v.property.code, name: v.property.name, timezone: v.property.timezone };
}
