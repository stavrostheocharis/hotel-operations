import { and, eq, sql } from "drizzle-orm";
import { schema, type Db, type Tx } from "@/db";
import { findProperty } from "@/db/scripts/seed";
import { loadBatch } from "@/import/loader";
import { embedSignals } from "@/link/embeddings";
import { linkSignals } from "@/link/pipeline";
import { createFakeLlm, createOpenAiLlm, type LlmClient } from "@/normalize/llm";
import { normalizeSignals } from "@/normalize/pipeline";
import type { JobKind, JobParams, JobProgressInfo } from "./types";

/**
 * Runs one job to its end, in whatever process calls it: the detached
 * worker in production, the test in the suite. Claims the row, keeps the
 * heartbeat, streams progress and log lines into the row, writes the
 * result or the error.
 */
export type RunOptions = {
  /** Replace the real model with the fake one (tests). */
  llm?: LlmClient | null;
  heartbeatMs?: number;
  log?: (line: string) => void;
};

const LOG_CAP = 500;

export async function runJob(db: Db, jobId: string, opts: RunOptions = {}): Promise<{ status: "succeeded" | "failed"; result?: Record<string, unknown>; error?: string }> {
  const [job] = await db
    .update(schema.jobs)
    .set({ status: "running", startedAt: new Date(), heartbeatAt: new Date(), pid: process.pid })
    .where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.status, "queued")))
    .returning();
  if (!job) throw new Error(`job ${jobId} is not queued`);
  const params = (job.params ?? {}) as JobParams;
  const lines: { at: string; line: string }[] = [];
  let dirty = false;
  const log = (line: string) => {
    lines.push({ at: new Date().toISOString(), line });
    if (lines.length > LOG_CAP) lines.splice(0, lines.length - LOG_CAP);
    dirty = true;
    opts.log?.(line);
  };
  let progress: JobProgressInfo | null = null;
  const onProgress = (p: JobProgressInfo) => {
    progress = p;
    dirty = true;
  };
  const flush = async () => {
    await db
      .update(schema.jobs)
      .set({ heartbeatAt: new Date(), ...(dirty ? { log: { lines }, progress: progress ?? {} } : {}) })
      .where(eq(schema.jobs.id, jobId));
    dirty = false;
  };
  const timer = setInterval(() => void flush().catch(() => undefined), opts.heartbeatMs ?? 5_000);
  const tenant = { groupId: job.groupId, propertyId: job.propertyId };
  await db.insert(schema.events).values({ ...tenant, entityType: "job", entityId: job.id, type: "job.started", actor: job.requestedBy ?? "system", payload: { kind: job.kind, params } });

  try {
    const property = await findProperty(db, params.propertyCode ?? (await codeOf(db, job.propertyId)));
    if (!property) throw new Error("property not found");
    const llm = opts.llm !== undefined ? opts.llm : params.llm ? createOpenAiLlm() : null;
    const result = await dispatch(db, job.kind, params, { propertyCode: property.code, propertyId: property.id, llm, log, onProgress });
    clearInterval(timer);
    await db.update(schema.jobs).set({ status: "succeeded", result, finishedAt: new Date(), heartbeatAt: new Date(), log: { lines }, progress: progress ?? {} }).where(eq(schema.jobs.id, jobId));
    await db.insert(schema.events).values({ ...tenant, entityType: "job", entityId: job.id, type: "job.finished", actor: job.requestedBy ?? "system", payload: { kind: job.kind, status: "succeeded" } });
    return { status: "succeeded", result };
  } catch (err) {
    clearInterval(timer);
    const error = err instanceof Error ? err.message : String(err);
    log(`failed: ${error}`);
    await db.update(schema.jobs).set({ status: "failed", error, finishedAt: new Date(), heartbeatAt: new Date(), log: { lines }, progress: progress ?? {} }).where(eq(schema.jobs.id, jobId));
    await db.insert(schema.events).values({ ...tenant, entityType: "job", entityId: job.id, type: "job.finished", actor: job.requestedBy ?? "system", payload: { kind: job.kind, status: "failed", error } });
    if (job.kind === "import" && params.batchId) {
      await db.update(schema.importBatches).set({ status: "failed", error }).where(eq(schema.importBatches.id, params.batchId));
    }
    return { status: "failed", error };
  }
}

async function codeOf(db: Db, propertyId: string): Promise<string> {
  const [p] = await db.select({ code: schema.properties.code }).from(schema.properties).where(eq(schema.properties.id, propertyId));
  if (!p) throw new Error("property not found");
  return p.code;
}

type Ctx = { propertyCode: string; propertyId: string; llm: LlmClient | null; log: (l: string) => void; onProgress: (p: JobProgressInfo) => void };

async function dispatch(db: Db, kind: JobKind, params: JobParams, c: Ctx): Promise<Record<string, unknown>> {
  switch (kind) {
    case "normalize": {
      c.onProgress({ step: "normalize", done: 0, total: 1 });
      const r = await normalizeSignals(db, { propertyCode: c.propertyCode, llm: c.llm, all: Boolean(params.all), log: c.log });
      c.onProgress({ step: "normalize", done: 1, total: 1 });
      return { processed: r.processed };
    }
    case "embed": {
      c.onProgress({ step: "embed", done: 0, total: 1 });
      const r = await embedSignals(db, { propertyId: c.propertyId, log: c.log });
      c.onProgress({ step: "embed", done: 1, total: 1 });
      return { embedded: r.embedded, model: r.model };
    }
    case "link": {
      c.onProgress({ step: "link", done: 0, total: 1 });
      const r = await linkSignals(db, { propertyCode: c.propertyCode, llm: c.llm, useEmbeddings: Boolean(params.embed), log: c.log, jobId: null });
      c.onProgress({ step: "link", done: 1, total: 1 });
      return { issues: r.issues, accepted: r.accepted, forReview: r.forReview, reconcile: r.reconcile };
    }
    case "import": {
      if (!params.batchId) throw new Error("import needs a batch");
      const [batch] = await db.select().from(schema.importBatches).where(eq(schema.importBatches.id, params.batchId));
      if (!batch) throw new Error("batch not found");
      await db.update(schema.importBatches).set({ status: "loading" }).where(eq(schema.importBatches.id, batch.id));
      c.onProgress({ step: "load", done: 0, total: 3, message: "reading the files" });
      const loaded = await loadBatch(db, { propertyCode: c.propertyCode, dir: batch.dir, mapping: batch.mapping as never, batchId: batch.id, log: c.log, onProgress: (m) => c.onProgress({ step: "load", done: 0, total: 3, message: m }) });
      await db.update(schema.importBatches).set({ status: "loaded", counts: loaded as unknown as Record<string, unknown> }).where(eq(schema.importBatches.id, batch.id));
      c.onProgress({ step: "normalize", done: 1, total: 3 });
      const n = await normalizeSignals(db, { propertyCode: c.propertyCode, llm: c.llm, log: c.log });
      c.onProgress({ step: "link", done: 2, total: 3 });
      const l = await linkSignals(db, { propertyCode: c.propertyCode, llm: c.llm, log: c.log });
      c.onProgress({ step: "done", done: 3, total: 3 });
      return { loaded: loaded as unknown as Record<string, unknown>, normalized: n.processed, issues: l.issues, forReview: l.forReview, reconcile: l.reconcile };
    }
    case "audit":
      throw new Error("the audit is computed on view; use pnpm db:audit for files");
  }
}

/** For tests and scripts without a model key. */
export const fakeLlm = createFakeLlm;

/** Mark a job the worker never finished (no heartbeat) as failed. */
export async function markStalled(db: Db | Tx, jobId: string): Promise<boolean> {
  const r = await db
    .update(schema.jobs)
    .set({ status: "failed", error: "the worker stopped reporting", finishedAt: new Date() })
    .where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.status, "running"), sql`${schema.jobs.heartbeatAt} < now() - interval '30 seconds'`))
    .returning({ id: schema.jobs.id });
  return r.length > 0;
}
