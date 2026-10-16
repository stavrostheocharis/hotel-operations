import { eq } from "drizzle-orm";
import { cache } from "react";
import { getAdminDb, schema, type TenantContext } from "@/db";

/**
 * Which property the console is showing. Until sign-in exists this is the
 * demo property named in DEMO_PROPERTY_CODE; the lookup needs the admin
 * connection because the app role sees nothing before a tenant context is
 * set. Everything after this goes through withTenant() on the app connection.
 */
export type CurrentTenant = TenantContext & {
  propertyId: string;
  code: string;
  name: string;
  timezone: string;
};

export const getCurrentTenant = cache(async (): Promise<CurrentTenant> => {
  const code = process.env.DEMO_PROPERTY_CODE ?? "ASTRAEA";
  const [p] = await getAdminDb()
    .select({
      id: schema.properties.id,
      groupId: schema.properties.groupId,
      code: schema.properties.code,
      name: schema.properties.name,
      timezone: schema.properties.timezone,
    })
    .from(schema.properties)
    .where(eq(schema.properties.code, code))
    .limit(1);
  if (!p) throw new Error(`property ${code} not found; run db:seed`);
  return { groupId: p.groupId, propertyIds: [p.id], propertyId: p.id, code: p.code, name: p.name, timezone: p.timezone };
});
