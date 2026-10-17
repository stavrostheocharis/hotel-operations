import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, id } from "./common";
import { users } from "./tenancy";

/**
 * Sign-in state. Neither table is readable by the app role: the web app
 * reaches them only through the SECURITY DEFINER functions in migration
 * 0006 (auth_credentials, auth_create_session, auth_resolve_session,
 * auth_delete_session, auth_set_password), so a password hash or a session
 * token never travels through an ordinary query. Not tenant tables: no
 * group/property columns; row-level security is forced with no policy so
 * only bypass roles (the migrator) can touch the rows directly.
 */
export const userCredentials = pgTable("user_credentials", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** scrypt$N$r$p$<salt>$<hash>, see src/auth/password.ts */
  passwordHash: text("password_hash").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** sha256 of the cookie value; the cookie itself is never stored. */
    tokenHash: text("token_hash").notNull().unique(),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    userAgent: text("user_agent"),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);
