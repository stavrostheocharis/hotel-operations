import { boolean, date, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, jsonbObject, updatedAt } from "./common";
import { department, userRole } from "./enums";

/** A hotel group (Mitsis, Grecotel, ...). The top of the tenancy tree. */
export const groups = pgTable("groups", {
  id: id(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** One property of a group. Every operational row is scoped to a property. */
export const properties = pgTable(
  "properties",
  {
    id: id(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    timezone: text("timezone").notNull().default("Europe/Athens"),
    seasonOpen: date("season_open"),
    seasonClose: date("season_close"),
    /** PropertySettings (src/console/property-settings.ts): recurrence windows, default departments, import time. */
    settings: jsonbObject("settings"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("properties_group_code_unique").on(t.groupId, t.code)],
);

/** Staff and managers. Scoped to a group; property access comes from memberships. */
export const users = pgTable("users", {
  id: id(),
  groupId: uuid("group_id")
    .notNull()
    .references(() => groups.id),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: userRole("role").notNull().default("staff"),
  department: department("department"),
  /** A deactivated user keeps their history but cannot sign in. */
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  /** UI language; "en" until Greek strings exist. */
  locale: text("locale").notNull().default("en"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Which properties a user can see, with an optional role override per property. */
export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: userRole("role"),
    createdAt: createdAt(),
  },
  (t) => [unique("memberships_user_property_unique").on(t.userId, t.propertyId)],
);
