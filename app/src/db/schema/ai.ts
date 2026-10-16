import {
  index,
  numeric,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createdAt, id, jsonbObject } from "./common";
import { suggestionDecision, suggestionKind } from "./enums";
import { tenantColumns } from "./tenant";

/**
 * Every model output, with what went in, which model and prompt produced it,
 * and what the human did with it. Audit trail and labelled examples in one.
 */
export const aiSuggestions = pgTable(
  "ai_suggestions",
  {
    id: id(),
    ...tenantColumns(),
    kind: suggestionKind("kind").notNull(),
    /** References to the rows the model saw, e.g. { signal_ids: [...] }. */
    inputRefs: jsonbObject("input_refs"),
    output: jsonbObject("output"),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    confidence: numeric("confidence", { precision: 4, scale: 3 }),
    decision: suggestionDecision("decision").notNull().default("pending"),
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("ai_suggestions_property_kind_idx").on(
      t.propertyId,
      t.kind,
      t.decision,
    ),
  ],
);
