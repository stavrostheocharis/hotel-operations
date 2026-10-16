import { index, pgEnum, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { createdAt, id } from "./common";
import { signals } from "./signals";
import { tenantColumns } from "./tenant";

export const linkDecision = pgEnum("link_decision", ["link", "unlink"]);

/**
 * A person's verdict on a pair of signals. Issues are rebuilt on every
 * linking run, so decisions are pinned on the pair, not on the issue id:
 * `link` is added as an accepted pair, `unlink` removes the pair from the
 * candidates. signal_a < signal_b by string order.
 */
export const linkDecisions = pgTable(
  "link_decisions",
  {
    id: id(),
    ...tenantColumns(),
    signalA: uuid("signal_a")
      .notNull()
      .references(() => signals.id),
    signalB: uuid("signal_b")
      .notNull()
      .references(() => signals.id),
    decision: linkDecision("decision").notNull(),
    decidedBy: text("decided_by").notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [
    unique("link_decisions_pair_unique").on(t.propertyId, t.signalA, t.signalB),
    index("link_decisions_property_idx").on(t.propertyId),
  ],
);
