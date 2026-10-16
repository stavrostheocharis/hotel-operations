import { date, integer, pgTable, unique, uuid } from "drizzle-orm/pg-core";
import { createdAt, id } from "./common";
import { locations } from "./locations";
import { tenantColumns } from "./tenant";

/**
 * Occupied room-nights per day per building. Not a signal: it is the
 * denominator for "repeat complaints per 1,000 occupied room-nights".
 */
export const occupancyDaily = pgTable(
  "occupancy_daily",
  {
    id: id(),
    ...tenantColumns(),
    day: date("day").notNull(),
    /** Building (or property root when the export is not split by building). */
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    roomsAvailable: integer("rooms_available").notNull(),
    roomsOccupied: integer("rooms_occupied").notNull(),
    arrivals: integer("arrivals"),
    departures: integer("departures"),
    createdAt: createdAt(),
  },
  (t) => [
    unique("occupancy_daily_property_day_location_unique").on(
      t.propertyId,
      t.day,
      t.locationId,
    ),
  ],
);
