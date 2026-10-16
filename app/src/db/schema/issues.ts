import {
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, jsonbObject, updatedAt } from "./common";
import {
  department,
  issueSeverity,
  issueSignalRole,
  issueStatus,
  linkMethod,
} from "./enums";
import { locations } from "./locations";
import { signals } from "./signals";
import { users } from "./tenancy";
import { tenantColumns } from "./tenant";

/**
 * The underlying problem behind one or more signals ("hot water, Building C").
 * Lifecycle: detected → assigned → resolved → verified, or reopened when a new
 * signal at the same location and category arrives within the recurrence
 * window after resolution. See docs/data-model.md.
 */
export const issues = pgTable(
  "issues",
  {
    id: id(),
    ...tenantColumns(),
    title: text("title").notNull(),
    category: text("category"),
    severity: issueSeverity("severity").notNull().default("medium"),
    status: issueStatus("status").notNull().default("detected"),
    locationId: uuid("location_id").references(() => locations.id),
    ownerUserId: uuid("owner_user_id").references(() => users.id),
    department: department("department"),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    reopenCount: integer("reopen_count").notNull().default(0),
    rootCause: text("root_cause"),
    recurrenceWindowDays: integer("recurrence_window_days")
      .notNull()
      .default(30),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("issues_property_status_idx").on(t.propertyId, t.status),
    index("issues_location_idx").on(t.locationId),
  ],
);

/**
 * Which signals belong to which issue, and why. `method` says who decided
 * (a rule, an embedding match, a model, a person) and `evidence` keeps what
 * they saw. This table is the product.
 */
export const issueSignals = pgTable(
  "issue_signals",
  {
    id: id(),
    ...tenantColumns(),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id),
    signalId: uuid("signal_id")
      .notNull()
      .references(() => signals.id),
    role: issueSignalRole("role").notNull().default("supporting"),
    confidence: numeric("confidence", { precision: 4, scale: 3 }),
    method: linkMethod("method").notNull(),
    evidence: jsonbObject("evidence"),
    /** 'system' or a user id. */
    decidedBy: text("decided_by").notNull().default("system"),
    decidedAt: timestamp("decided_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("issue_signals_pair_unique").on(t.issueId, t.signalId),
    index("issue_signals_signal_idx").on(t.signalId),
  ],
);
