import { index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, id } from "./common";
import { department } from "./enums";
import { issues } from "./issues";
import { locations } from "./locations";
import { outcomes } from "./outcomes";
import { users } from "./tenancy";
import { tenantColumns } from "./tenant";

export const verificationStatus = pgEnum("verification_status", ["open", "done", "skipped"]);

/**
 * "Check room 263 on Thursday": a task that proves a fix held. Scheduled
 * when an issue is marked resolved (by default two days later, for the
 * owner), or by hand. Completing it records an outcome on the issue
 * (staff evidence, guest confirmation, or it came back) and moves the
 * issue to verified or reopened. Survives linker rebuilds with the issue.
 */
export const verificationTasks = pgTable(
  "verification_tasks",
  {
    id: id(),
    ...tenantColumns(),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").references(() => locations.id),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    instructions: text("instructions"),
    assigneeUserId: uuid("assignee_user_id").references(() => users.id),
    assigneeDepartment: department("assignee_department"),
    status: verificationStatus("status").notNull().default("open"),
    /** staff_evidence | guest_confirmed | recurred, once done. */
    result: text("result"),
    outcomeId: uuid("outcome_id").references(() => outcomes.id),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
    doneAt: timestamp("done_at", { withTimezone: true }),
    doneBy: uuid("done_by").references(() => users.id),
  },
  (t) => [index("verification_tasks_property_status_due_idx").on(t.propertyId, t.status, t.dueAt), index("verification_tasks_issue_idx").on(t.issueId)],
);
