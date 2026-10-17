import { sql } from "drizzle-orm";
import {
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, jsonbObject } from "./common";
import { locationMethod, signalSource } from "./enums";
import { locations } from "./locations";
import { tenantColumns } from "./tenant";

/**
 * One raw observation: a work order, a front-desk complaint, a survey, a
 * review, a staff report, a guest QR message, a PMS stay.
 *
 * The observation itself is immutable (a trigger rejects changes to source,
 * external_id, occurred_at, text_original, raw, stay_ref). The derived
 * columns (language, text_en, location_*, category) are filled in by the
 * normalisation step and may change as it improves.
 */
export const signals = pgTable(
  "signals",
  {
    id: id(),
    ...tenantColumns(),
    source: signalSource("source").notNull(),
    externalId: text("external_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    language: text("language"),
    textOriginal: text("text_original"),
    textEn: text("text_en"),
    /** Pseudonymous stay key. The mapping to the PMS reservation lives in pii.stay_keys. */
    stayRef: text("stay_ref"),
    locationId: uuid("location_id").references(() => locations.id),
    locationConfidence: numeric("location_confidence", {
      precision: 4,
      scale: 3,
    }),
    locationMethod: locationMethod("location_method")
      .notNull()
      .default("none"),
    category: text("category"),
    /** Finer than category: "no_hot_water", "keycard_fails". Derived. */
    topic: text("topic"),
    /** 0–1 confidence of the language detection. Derived. */
    languageConfidence: numeric("language_confidence", {
      precision: 4,
      scale: 3,
    }),
    /** What normalisation found: extracted room numbers, keyword hits, pii redactions, stage versions. Derived. */
    normalized: jsonbObject("normalized"),
    normalizedAt: timestamp("normalized_at", { withTimezone: true }),
    /** Derived fields a person set by hand ('category', 'topic', 'location'); normalisation leaves them alone. */
    lockedFields: text("locked_fields")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** The record in the data request's own field names, whatever the export called them. Filled by the loaders. */
    mapped: jsonbObject("mapped"),
    raw: jsonbObject("raw"),
    ingestBatchId: text("ingest_batch_id"),
    createdAt: createdAt(),
  },
  (t) => [
    unique("signals_property_source_external_unique").on(
      t.propertyId,
      t.source,
      t.externalId,
    ),
    index("signals_property_occurred_idx").on(t.propertyId, t.occurredAt),
    index("signals_location_idx").on(t.locationId),
    index("signals_stay_ref_idx").on(t.stayRef),
  ],
);
