import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, jsonbObject } from "./common";
import { actionKind } from "./enums";
import { issues } from "./issues";
import { tenantColumns } from "./tenant";

/**
 * What was done about an issue. Tickets live in the hotel's own system; we
 * keep the external reference, never the ticket.
 */
export const actions = pgTable(
  "actions",
  {
    id: id(),
    ...tenantColumns(),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id),
    kind: actionKind("kind").notNull(),
    externalSystem: text("external_system"),
    externalRef: text("external_ref"),
    actor: text("actor"),
    performedAt: timestamp("performed_at", { withTimezone: true }).notNull(),
    details: jsonbObject("details"),
    createdAt: createdAt(),
  },
  (t) => [index("actions_issue_idx").on(t.issueId)],
);
