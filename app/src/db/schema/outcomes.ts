import {
  index,
  integer,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, jsonbObject } from "./common";
import { outcomeKind } from "./enums";
import { issues } from "./issues";
import { tenantColumns } from "./tenant";

/** Strength ladder for evidence that a fix held. Higher is stronger. */
export const OUTCOME_STRENGTH = {
  guest_confirmed: 3,
  staff_evidence: 2,
  no_recurrence: 1,
  recurred: 0,
} as const;

/**
 * Evidence about whether an issue's fix held. A guest confirming via the room
 * QR beats a technician's photo, which beats silence. `recurred` is the
 * outcome that reopens an issue.
 */
export const outcomes = pgTable(
  "outcomes",
  {
    id: id(),
    ...tenantColumns(),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id),
    kind: outcomeKind("kind").notNull(),
    strength: integer("strength").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    evidence: jsonbObject("evidence"),
    createdAt: createdAt(),
  },
  (t) => [index("outcomes_issue_idx").on(t.issueId)],
);
