import { sql } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  unique,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { createdAt, id, jsonbObject, updatedAt } from "./common";
import { locationKind } from "./enums";
import { tenantColumns } from "./tenant";

/**
 * The location hierarchy: property → building → floor → room, plus facilities
 * (pool, spa, restaurant) and shared equipment (boiler, chiller, lift).
 * `aliases` holds the spellings staff actually type ("Rm 312", "Δωμ. 312",
 * "Villa 12", "Λεβητοστάσιο C") so a signal can be matched without a model.
 */
export const locations = pgTable(
  "locations",
  {
    id: id(),
    ...tenantColumns(),
    kind: locationKind("kind").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => locations.id),
    aliases: text("aliases")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    attributes: jsonbObject("attributes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("locations_property_code_unique").on(t.propertyId, t.code),
    index("locations_parent_idx").on(t.parentId),
    index("locations_kind_idx").on(t.propertyId, t.kind),
  ],
);

/**
 * What a piece of equipment serves: a boiler serves a building, a heat pump
 * serves a pool. This is what lets five "no hot water" rooms collapse into
 * one boiler problem.
 */
export const locationLinks = pgTable(
  "location_links",
  {
    id: id(),
    ...tenantColumns(),
    equipmentId: uuid("equipment_id")
      .notNull()
      .references(() => locations.id),
    servesId: uuid("serves_id")
      .notNull()
      .references(() => locations.id),
    relation: text("relation").notNull().default("serves"),
    createdAt: createdAt(),
  },
  (t) => [
    unique("location_links_pair_unique").on(t.equipmentId, t.servesId),
    index("location_links_serves_idx").on(t.servesId),
  ],
);
