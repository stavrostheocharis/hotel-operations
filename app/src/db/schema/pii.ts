import { pgSchema, text, unique, uuid } from "drizzle-orm/pg-core";
import { createdAt, id } from "./common";

/**
 * Personal data lives in its own schema. Nothing in `public` has a foreign
 * key into it, the app role has no privileges on it, and only `pii_admin`
 * can read it. Operational tables carry only the pseudonymous `stay_ref`.
 */
export const piiSchema = pgSchema("pii");

export const stayKeys = piiSchema.table(
  "stay_keys",
  {
    id: id(),
    /** Deliberately not a foreign key: no join path from public into pii. */
    propertyId: uuid("property_id").notNull(),
    stayRef: text("stay_ref").notNull(),
    reservationNo: text("reservation_no").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("stay_keys_property_ref_unique").on(t.propertyId, t.stayRef),
    unique("stay_keys_property_reservation_unique").on(
      t.propertyId,
      t.reservationNo,
    ),
  ],
);
