import "server-only";

import { spawn } from "node:child_process";
import path from "node:path";
import { sql } from "drizzle-orm";
import { schema, withTenant, type Db, type TenantContext } from "@/db";
import type { JobKind, JobParams } from "./types";

/**
 * Starts a job from the web app: one row, then a detached child process
 * that runs it (src/jobs/worker.ts). The row is the only contract between
 * the two; the page follows it through /api/jobs/[id].
 */
export class JobAlreadyRunning extends Error {
  constructor(kind: string) {
    super(`a ${kind} job is already queued or running`);
    this.name = "JobAlreadyRunning";
  }
}

export async function enqueueJob(db: Db, ctx: TenantContext, input: { propertyId: string; kind: JobKind; params?: JobParams; requestedBy: string }): Promise<{ id: string }> {
  const id = await withTenant(db, ctx, async (tx) => {
    try {
      const [row] = await tx
        .insert(schema.jobs)
        .values({ groupId: ctx.groupId, propertyId: input.propertyId, kind: input.kind, params: input.params ?? {}, requestedBy: input.requestedBy })
        .returning({ id: schema.jobs.id });
      return row.id;
    } catch (err) {
      if (err instanceof Error && /jobs_one_active_per_kind/.test(String((err as { cause?: unknown }).cause ?? err.message))) throw new JobAlreadyRunning(input.kind);
      throw err;
    }
  });
  spawnWorker(id);
  return { id };
}

/** Detached, so a dev-server restart or a finished request does not kill it. */
export function spawnWorker(jobId: string): void {
  const appDir = process.cwd();
  const tsx = path.join(appDir, "node_modules", "tsx", "dist", "cli.mjs");
  const child = spawn(process.execPath, [tsx, path.join(appDir, "src", "jobs", "worker.ts"), "--job", jobId], {
    cwd: appDir,
    env: process.env,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

/** Queued jobs whose worker never started (a crash between insert and spawn) are rare; this lets a page restart them. */
export async function respawnQueued(db: Db, ctx: TenantContext, jobId: string): Promise<boolean> {
  const rows = await withTenant(db, ctx, (tx) => tx.execute<{ id: string }>(sql`select id from jobs where id = ${jobId} and status = 'queued' and created_at < now() - interval '1 minute'`));
  if (!rows.length) return false;
  spawnWorker(jobId);
  return true;
}
