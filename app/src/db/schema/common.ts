import { sql } from "drizzle-orm";
import { jsonb, timestamp, uuid } from "drizzle-orm/pg-core";

export const id = () => uuid("id").primaryKey().defaultRandom();

export const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const jsonbObject = (name: string) =>
  jsonb(name)
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`);
