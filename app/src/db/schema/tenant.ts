import { uuid } from "drizzle-orm/pg-core";
import { groups, properties } from "./tenancy";

/**
 * Columns every operational table carries. Row-level security policies key on
 * these two, so they are denormalised onto every row rather than reached
 * through joins.
 */
export const tenantColumns = () => ({
  groupId: uuid("group_id")
    .notNull()
    .references(() => groups.id),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id),
});
