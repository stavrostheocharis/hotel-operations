import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id, jsonbObject } from "./common";
import { tenantColumns } from "./tenant";

/**
 * Append-only log of everything that happens (signal.created, issue.linked,
 * issue.reopened, verification.due, ...). Rules, timers and digests run off
 * it. A trigger rejects UPDATE and DELETE.
 */
export const events = pgTable(
  "events",
  {
    id: id(),
    ...tenantColumns(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    type: text("type").notNull(),
    payload: jsonbObject("payload"),
    actor: text("actor").notNull().default("system"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("events_entity_idx").on(t.entityType, t.entityId),
    index("events_property_occurred_idx").on(t.propertyId, t.occurredAt),
    index("events_type_idx").on(t.type),
  ],
);
