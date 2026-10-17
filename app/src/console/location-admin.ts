import { and, eq, sql } from "drizzle-orm";
import { assertCan, type Actor } from "@/auth/permissions";
import { schema, withTenant, type Db, type TenantContext, type Tx } from "@/db";
import { TYPED_LOCATION } from "./locations";

/**
 * Settings → Locations: aliases, what equipment serves, mapping the
 * spellings staff type to real places, new places. Every change is an
 * event; mapping a spelling also moves the records that carried it.
 */
type Kind = (typeof schema.locationKind.enumValues)[number];

async function load(tx: Tx, id: string) {
  const [l] = await tx
    .select({ id: schema.locations.id, groupId: schema.locations.groupId, propertyId: schema.locations.propertyId, code: schema.locations.code, kind: schema.locations.kind, aliases: schema.locations.aliases, name: schema.locations.name })
    .from(schema.locations)
    .where(eq(schema.locations.id, id));
  if (!l) throw new Error("place not found");
  return l;
}

function cleanAlias(alias: string): string {
  const a = alias.trim().replace(/\s+/g, " ");
  if (a.length < 1 || a.length > 80) throw new Error("an alias is 1–80 characters");
  return a;
}

export async function addAlias(db: Db, ctx: TenantContext, actor: Actor, input: { locationId: string; alias: string }): Promise<string[]> {
  assertCan(actor, "settings.locations");
  const alias = cleanAlias(input.alias);
  return withTenant(db, ctx, async (tx) => {
    const l = await load(tx, input.locationId);
    if (l.aliases.some((a) => a.toLowerCase() === alias.toLowerCase())) return l.aliases;
    const aliases = [...l.aliases, alias];
    await tx.update(schema.locations).set({ aliases }).where(eq(schema.locations.id, l.id));
    await tx.insert(schema.events).values({ groupId: l.groupId, propertyId: l.propertyId, entityType: "location", entityId: l.id, type: "location.alias_added", actor: actor.userId, payload: { alias } });
    return aliases;
  });
}

export async function removeAlias(db: Db, ctx: TenantContext, actor: Actor, input: { locationId: string; alias: string }): Promise<string[]> {
  assertCan(actor, "settings.locations");
  return withTenant(db, ctx, async (tx) => {
    const l = await load(tx, input.locationId);
    const aliases = l.aliases.filter((a) => a !== input.alias);
    if (aliases.length === l.aliases.length) return aliases;
    await tx.update(schema.locations).set({ aliases }).where(eq(schema.locations.id, l.id));
    await tx.insert(schema.events).values({ groupId: l.groupId, propertyId: l.propertyId, entityType: "location", entityId: l.id, type: "location.alias_removed", actor: actor.userId, payload: { alias: input.alias } });
    return aliases;
  });
}

/** Replace what a piece of equipment serves (buildings, floors, rooms, facilities). */
export async function setServes(db: Db, ctx: TenantContext, actor: Actor, input: { equipmentId: string; servesIds: string[] }): Promise<number> {
  assertCan(actor, "settings.locations");
  return withTenant(db, ctx, async (tx) => {
    const e = await load(tx, input.equipmentId);
    if (e.kind !== "equipment") throw new Error("only equipment serves places");
    const ids = Array.from(new Set(input.servesIds.filter((id) => id && id !== e.id)));
    await tx.delete(schema.locationLinks).where(eq(schema.locationLinks.equipmentId, e.id));
    if (ids.length) {
      await tx.insert(schema.locationLinks).values(ids.map((servesId) => ({ groupId: e.groupId, propertyId: e.propertyId, equipmentId: e.id, servesId }))).onConflictDoNothing();
    }
    await tx.insert(schema.events).values({ groupId: e.groupId, propertyId: e.propertyId, entityType: "location", entityId: e.id, type: "location.serves_set", actor: actor.userId, payload: { serves: ids } });
    return ids.length;
  });
}

/**
 * "Δωμ. 028 means room 028": the spelling becomes an alias of the place and
 * every unresolved record that carries it moves there, marked as resolved
 * by alias. Returns how many records moved.
 */
export async function mapSpelling(db: Db, ctx: TenantContext, actor: Actor, input: { spelling: string; locationId: string }): Promise<{ moved: number; code: string }> {
  assertCan(actor, "settings.locations");
  const spelling = cleanAlias(input.spelling);
  return withTenant(db, ctx, async (tx) => {
    const l = await load(tx, input.locationId);
    if (!l.aliases.some((a) => a.toLowerCase() === spelling.toLowerCase())) {
      await tx.update(schema.locations).set({ aliases: [...l.aliases, spelling] }).where(eq(schema.locations.id, l.id));
    }
    const moved = await tx.execute<{ id: string }>(sql`
      update signals s
      set location_id = ${l.id}, location_method = 'alias', location_confidence = 0.900,
          normalized = s.normalized || jsonb_build_object('location_rule', 'alias:settings')
      where s.location_method = 'none' and s.location_id is null
        and s.source in ('work_order', 'front_desk', 'staff_report', 'guest_qr')
        and lower(${TYPED_LOCATION}) = lower(${spelling})
      returning s.id
    `);
    await tx.insert(schema.events).values({ groupId: l.groupId, propertyId: l.propertyId, entityType: "location", entityId: l.id, type: "location.spelling_mapped", actor: actor.userId, payload: { spelling, moved: moved.length } });
    return { moved: moved.length, code: l.code };
  });
}

export async function createLocation(db: Db, ctx: TenantContext, actor: Actor, input: { kind: string; code: string; name: string; parentId?: string | null }): Promise<{ id: string }> {
  assertCan(actor, "settings.locations");
  if (!schema.locationKind.enumValues.includes(input.kind as Kind) || input.kind === "property") throw new Error("unknown kind");
  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  if (!/^[A-Z0-9][A-Z0-9/_-]{0,31}$/.test(code)) throw new Error("a code is letters, digits, - / _");
  if (!name) throw new Error("a name is needed");
  return withTenant(db, ctx, async (tx) => {
    let parentId = input.parentId ?? null;
    if (!parentId) {
      const [root] = await tx.select({ id: schema.locations.id }).from(schema.locations).where(eq(schema.locations.kind, "property"));
      parentId = root?.id ?? null;
    }
    const [parent] = parentId ? await tx.select({ groupId: schema.locations.groupId, propertyId: schema.locations.propertyId }).from(schema.locations).where(eq(schema.locations.id, parentId)) : [];
    if (!parent) throw new Error("parent not found");
    const [row] = await tx
      .insert(schema.locations)
      .values({ groupId: parent.groupId, propertyId: parent.propertyId, kind: input.kind as Kind, code, name, parentId, aliases: [name] })
      .returning({ id: schema.locations.id });
    await tx.insert(schema.events).values({ groupId: parent.groupId, propertyId: parent.propertyId, entityType: "location", entityId: row.id, type: "location.created", actor: actor.userId, payload: { kind: input.kind, code, name } });
    return { id: row.id };
  });
}

export async function renameLocation(db: Db, ctx: TenantContext, actor: Actor, input: { locationId: string; name: string }): Promise<void> {
  assertCan(actor, "settings.locations");
  const name = input.name.trim();
  if (!name) throw new Error("a name is needed");
  return withTenant(db, ctx, async (tx) => {
    const l = await load(tx, input.locationId);
    await tx.update(schema.locations).set({ name }).where(and(eq(schema.locations.id, l.id)));
    await tx.insert(schema.events).values({ groupId: l.groupId, propertyId: l.propertyId, entityType: "location", entityId: l.id, type: "location.renamed", actor: actor.userId, payload: { from: l.name, to: name } });
  });
}
