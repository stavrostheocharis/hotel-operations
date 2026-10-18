import { sql } from "drizzle-orm";
import { bigint, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, jsonbObject, updatedAt } from "./common";
import { users } from "./tenancy";
import { tenantColumns } from "./tenant";

export const jobKind = pgEnum("job_kind", ["normalize", "link", "embed", "import", "audit"]);
export const jobStatus = pgEnum("job_status", ["queued", "running", "succeeded", "failed", "cancelled"]);

/**
 * Long work started from the console (normalise, link, import …) runs in a
 * detached worker process; this row is how the page follows it. One job of
 * a kind per property at a time.
 */
export const jobs = pgTable(
  "jobs",
  {
    id: id(),
    ...tenantColumns(),
    kind: jobKind("kind").notNull(),
    status: jobStatus("status").notNull().default("queued"),
    params: jsonbObject("params"),
    /** { step, done, total, message } */
    progress: jsonbObject("progress"),
    /** { lines: [{ at, line }] }, capped by the worker. */
    log: jsonbObject("log"),
    result: jsonbObject("result"),
    error: text("error"),
    requestedBy: uuid("requested_by").references(() => users.id),
    pid: integer("pid"),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("jobs_property_created_idx").on(t.propertyId, t.createdAt),
    uniqueIndex("jobs_one_active_per_kind")
      .on(t.propertyId, t.kind)
      .where(sql`status in ('queued', 'running')`),
  ],
);

export const importSource = pgEnum("import_source", ["upload", "folder"]);
export const importStatus = pgEnum("import_status", ["uploaded", "checked", "loading", "loaded", "failed", "discarded"]);

/**
 * One delivery of a client's exports: the files, the reality check's
 * verdict and mapping, and what the load did with them. Signals carry the
 * batch id in `ingest_batch_id`.
 */
export const importBatches = pgTable(
  "import_batches",
  {
    id: id(),
    ...tenantColumns(),
    source: importSource("source").notNull(),
    /** Folder on the server: under uploads/ for an upload, or the configured data folder. */
    dir: text("dir").notNull(),
    /** [{ name, bytes }] */
    /** [{ name, bytes }] as delivered. */
    files: jsonb("files").$type<{ name: string; bytes: number }[]>().notNull().default([]),
    bytes: bigint("bytes", { mode: "number" }).notNull().default(0),
    status: importStatus("status").notNull().default("uploaded"),
    verdict: text("verdict"),
    realityReport: jsonbObject("reality_report"),
    mapping: jsonbObject("mapping"),
    counts: jsonbObject("counts"),
    jobId: uuid("job_id"),
    error: text("error"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("import_batches_property_created_idx").on(t.propertyId, t.createdAt)],
);
