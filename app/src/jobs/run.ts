import { and, eq, inArray, sql } from "drizzle-orm";
import { schema, type Db, type Tx } from "@/db";
import { findPropertyById } from "@/db/scripts/seed";
import { loadBatch } from "@/import/loader";
import { embedSignals } from "@/link/embeddings";
import { linkSignals } from "@/link/pipeline";
import { createFakeLlm, createOpenAiLlm, type LlmClient } from "@/normalize/llm";
import { normalizeSignals } from "@/normalize/pipeline";
import { STALL_MS, SWEEP_AFTER_MS, type JobKind, type JobParams, type JobProgressInfo } from "./types";
import { applyMappingOverrides, mappingFromReport } from "@/import/mapping";
import { readSettings } from "@/console/property-settings";
import { runRealityCheck } from "@/reality";
import { notifyOperator } from "./alerts";

/**
 * Runs one job to its end, in whatever process calls it: the worker
 * service in production, the test in the suite. Claims the row, keeps the
 * heartbeat, streams progress and log lines into the row, writes the
 * result or the error. Every write to the row is conditional on it still
 * being `running`: a job a person marked failed stops at its next log
 * line and never writes its result over theirs.
 */
export type RunOptions = {
  /** Replace the real model with the fake one (tests). */
  llm?: LlmClient | null;
  heartbeatMs?: number;
  log?: (line: string) => void;
};

export type JobRow = typeof schema.jobs.$inferSelect;
export type RunResult = { status: "succeeded" | "failed"; result?: Record<string, unknown>; error?: string };

const LOG_CAP = 500;

/** Thrown inside the work when the row stopped being ours. */
export class JobAborted extends Error {
  constructor() {
    super("the job was stopped elsewhere");
    this.name = "JobAborted";
  }
}

/** Claim one job by id (a worker started for it, or a test). */
export async function runJob(db: Db, jobId: string, opts: RunOptions = {}): Promise<RunResult> {
  const [job] = await db
    .update(schema.jobs)
    .set({ status: "running", startedAt: new Date(), heartbeatAt: new Date(), pid: process.pid })
    .where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.status, "queued")))
    .returning();
  if (!job) throw new Error(`job ${jobId} is not queued`);
  return runClaimed(db, job, opts);
}

/**
 * Claim the oldest queued job, whichever worker asks first (`FOR UPDATE
 * SKIP LOCKED`, so several workers never take the same row). Null when
 * nothing is queued.
 */
export async function claimNextJob(db: Db): Promise<JobRow | null> {
  const [job] = await db
    .update(schema.jobs)
    .set({ status: "running", startedAt: new Date(), heartbeatAt: new Date(), pid: process.pid })
    .where(eq(schema.jobs.id, sql`(select id from jobs where status = 'queued' order by created_at limit 1 for update skip locked)`))
    .returning();
  return job ?? null;
}

/** Run a job this process has claimed. */
export async function runClaimed(db: Db, job: JobRow, opts: RunOptions = {}): Promise<RunResult> {
  const jobId = job.id;
  const params = (job.params ?? {}) as JobParams;
  const lines: { at: string; line: string }[] = [];
  let dirty = false;
  let aborted = false;
  const assertAlive = () => {
    if (aborted) throw new JobAborted();
  };
  const log = (line: string) => {
    assertAlive();
    lines.push({ at: new Date().toISOString(), line });
    if (lines.length > LOG_CAP) lines.splice(0, lines.length - LOG_CAP);
    dirty = true;
    opts.log?.(line);
  };
  let progress: JobProgressInfo | null = null;
  const onProgress = (p: JobProgressInfo) => {
    assertAlive();
    progress = p;
    dirty = true;
  };
  const flush = async () => {
    const r = await db
      .update(schema.jobs)
      .set({ heartbeatAt: new Date(), ...(dirty ? { log: { lines }, progress: progress ?? {} } : {}) })
      .where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.status, "running")))
      .returning({ id: schema.jobs.id });
    dirty = false;
    if (r.length === 0) aborted = true;
  };
  const timer = setInterval(() => void flush().catch(() => undefined), opts.heartbeatMs ?? 5_000);
  const tenant = { groupId: job.groupId, propertyId: job.propertyId };
  await db.insert(schema.events).values({ ...tenant, entityType: "job", entityId: job.id, type: "job.started", actor: job.requestedBy ?? "system", payload: { kind: job.kind, params } });

  try {
    const property = await findPropertyById(db, job.propertyId);
    if (!property) throw new Error("property not found");
    const llm = opts.llm !== undefined ? opts.llm : params.llm ? createOpenAiLlm() : null;
    const result = await dispatch(db, job.kind, params, { propertyCode: property.code, propertyId: property.id, llm, log, onProgress });
    clearInterval(timer);
    const done = await db
      .update(schema.jobs)
      .set({ status: "succeeded", result, finishedAt: new Date(), heartbeatAt: new Date(), log: { lines }, progress: progress ?? {} })
      .where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.status, "running")))
      .returning({ id: schema.jobs.id });
    if (done.length === 0) {
      opts.log?.(`job ${jobId}: finished, but the row was no longer running; result discarded`);
      return { status: "failed", error: "the job was stopped elsewhere" };
    }
    await db.insert(schema.events).values({ ...tenant, entityType: "job", entityId: job.id, type: "job.finished", actor: job.requestedBy ?? "system", payload: { kind: job.kind, status: "succeeded" } });
    return { status: "succeeded", result };
  } catch (err) {
    clearInterval(timer);
    if (err instanceof JobAborted || aborted) {
      opts.log?.(`job ${jobId}: stopped elsewhere, giving up`);
      return { status: "failed", error: "the job was stopped elsewhere" };
    }
    const error = err instanceof Error ? err.message : String(err);
    lines.push({ at: new Date().toISOString(), line: `failed: ${error}` });
    opts.log?.(`failed: ${error}`);
    const done = await db
      .update(schema.jobs)
      .set({ status: "failed", error, finishedAt: new Date(), heartbeatAt: new Date(), log: { lines }, progress: progress ?? {} })
      .where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.status, "running")))
      .returning({ id: schema.jobs.id });
    if (done.length) {
      await db.insert(schema.events).values({ ...tenant, entityType: "job", entityId: job.id, type: "job.finished", actor: job.requestedBy ?? "system", payload: { kind: job.kind, status: "failed", error } });
      await notifyOperator(`Job ${job.kind} failed for property ${job.propertyId}: ${error}`);
      if ((job.kind === "import" || job.kind === "check") && params.batchId) {
        await db
          .update(schema.importBatches)
          .set({ status: "failed", error })
          .where(and(eq(schema.importBatches.id, params.batchId), inArray(schema.importBatches.status, ["loading", "checking"])));
      }
    }
    return { status: "failed", error };
  }
}


type Ctx = { propertyCode: string; propertyId: string; llm: LlmClient | null; log: (l: string) => void; onProgress: (p: JobProgressInfo) => void };

async function dispatch(db: Db, kind: JobKind, params: JobParams, c: Ctx): Promise<Record<string, unknown>> {
  switch (kind) {
    case "normalize": {
      c.onProgress({ step: "normalize", done: 0, total: 1 });
      const r = await normalizeSignals(db, { propertyId: c.propertyId, propertyCode: c.propertyCode, llm: c.llm, all: Boolean(params.all), log: c.log });
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
      const r = await linkSignals(db, { propertyId: c.propertyId, propertyCode: c.propertyCode, llm: c.llm, useEmbeddings: Boolean(params.embed), log: c.log, jobId: null });
      c.onProgress({ step: "link", done: 1, total: 1 });
      return { issues: r.issues, accepted: r.accepted, forReview: r.forReview, reconcile: r.reconcile };
    }
    case "import": {
      if (!params.batchId) throw new Error("import needs a batch");
      const [batch] = await db.select().from(schema.importBatches).where(eq(schema.importBatches.id, params.batchId));
      if (!batch) throw new Error("batch not found");
      await db.update(schema.importBatches).set({ status: "loading" }).where(and(eq(schema.importBatches.id, batch.id), sql`${schema.importBatches.status} <> 'discarded'`));
      c.onProgress({ step: "load", done: 0, total: 3, message: "reading the files" });
      const loaded = await loadBatch(db, { propertyId: c.propertyId, propertyCode: c.propertyCode, dir: batch.dir, mapping: batch.mapping as never, batchId: batch.id, log: c.log, onProgress: (m) => c.onProgress({ step: "load", done: 0, total: 3, message: m }) });
      await db.update(schema.importBatches).set({ status: "loaded", counts: loaded as unknown as Record<string, unknown> }).where(and(eq(schema.importBatches.id, batch.id), eq(schema.importBatches.status, "loading")));
      c.onProgress({ step: "normalize", done: 1, total: 3 });
      const n = await normalizeSignals(db, { propertyId: c.propertyId, propertyCode: c.propertyCode, llm: c.llm, log: c.log });
      c.onProgress({ step: "link", done: 2, total: 3 });
      const l = await linkSignals(db, { propertyId: c.propertyId, propertyCode: c.propertyCode, llm: c.llm, log: c.log });
      c.onProgress({ step: "done", done: 3, total: 3 });
      return { loaded: loaded as unknown as Record<string, unknown>, normalized: n.processed, issues: l.issues, forReview: l.forReview, reconcile: l.reconcile };
    }
    case "check": {
      if (!params.batchId) throw new Error("check needs a batch");
      const [batch] = await db.select().from(schema.importBatches).where(eq(schema.importBatches.id, params.batchId));
      if (!batch) throw new Error("batch not found");
      c.onProgress({ step: "check", done: 0, total: 1, message: "reading the files" });
      const { report } = await runRealityCheck(batch.dir);
      const settings = await readSettings(db, c.propertyId);
      const mapping = applyMappingOverrides(mappingFromReport(report), report, settings.mappingOverrides);
      const updated = await db
        .update(schema.importBatches)
        .set({ status: "checked", verdict: report.decision.verdict, realityReport: report as unknown as Record<string, unknown>, mapping: mapping as unknown as Record<string, unknown>, error: null })
        .where(and(eq(schema.importBatches.id, batch.id), eq(schema.importBatches.status, "checking")))
        .returning({ id: schema.importBatches.id });
      if (updated.length) {
        await db.insert(schema.events).values({ groupId: batch.groupId, propertyId: batch.propertyId, entityType: "import", entityId: batch.id, type: "import.checked", actor: "system", payload: { verdict: report.decision.verdict, datasets: mapping.files.length } });
      }
      c.onProgress({ step: "check", done: 1, total: 1 });
      c.log(`check: ${report.decision.verdict}, ${mapping.files.length} files mapped`);
      return { verdict: report.decision.verdict, files: mapping.files.length };
    }
    case "audit":
      throw new Error("the audit is computed on view; use pnpm db:audit for files");
  }
}

/** For tests and scripts without a model key. */
export const fakeLlm = createFakeLlm;

/**
 * Mark a running job whose heartbeat stopped as failed, and fail the import
 * batch it was loading so the wizard offers Load again instead of waiting
 * forever. The job's own process, if it is still alive, notices at its next
 * heartbeat and gives up.
 */
export async function markStalled(db: Db | Tx, jobId: string, olderThanMs = STALL_MS): Promise<boolean> {
  const r = await db
    .update(schema.jobs)
    .set({ status: "failed", error: "the worker stopped reporting", finishedAt: new Date() })
    .where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.status, "running"), sql`${schema.jobs.heartbeatAt} < now() - make_interval(secs => ${olderThanMs / 1000})`))
    .returning({ id: schema.jobs.id });
  if (r.length === 0) return false;
  await db
    .update(schema.importBatches)
    .set({ status: "failed", error: "the worker stopped reporting" })
    .where(and(eq(schema.importBatches.jobId, jobId), inArray(schema.importBatches.status, ["loading", "checking"])));
  return true;
}

/**
 * The worker's sweeper: fail every running job that has not reported for
 * SWEEP_AFTER_MS (a dead process), and fail every batch still `loading`
 * whose job already ended. Returns what it touched.
 */
export async function sweepStalled(db: Db, olderThanMs = SWEEP_AFTER_MS): Promise<{ jobs: number; batches: number }> {
  const stale = await db
    .select({ id: schema.jobs.id })
    .from(schema.jobs)
    .where(and(eq(schema.jobs.status, "running"), sql`${schema.jobs.heartbeatAt} < now() - make_interval(secs => ${olderThanMs / 1000})`));
  let jobs = 0;
  for (const j of stale) if (await markStalled(db, j.id, olderThanMs)) jobs++;
  if (jobs) await notifyOperator(`${jobs} background job(s) stopped reporting and were marked failed`);
  const batches = await db.execute<{ id: string }>(sql`
    update import_batches b set status = 'failed', error = coalesce(j.error, 'the job ended without finishing the load')
    from jobs j where b.job_id = j.id and b.status in ('loading', 'checking') and j.status in ('failed', 'cancelled', 'succeeded')
    returning b.id
  `);
  return { jobs, batches: batches.length };
}
