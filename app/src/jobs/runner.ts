import "server-only";

import { spawn } from "node:child_process";
import path from "node:path";
import { schema, withTenant, type Db, type TenantContext } from "@/db";
import type { JobKind, JobParams } from "./types";

/**
 * Starts a job from the web app: one `jobs` row. The worker service
 * (src/jobs/worker.ts, `pnpm jobs:worker`) picks it up; the row is the only
 * contract between the two and the page follows it through /api/jobs/[id].
 *
 * In development only, where nobody runs the service, a one-shot worker is
 * spawned for the row so the wizard still moves. Set JOBS_SPAWN=0 to run
 * the service yourself in development too.
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
  if (process.env.NODE_ENV !== "production" && process.env.JOBS_SPAWN !== "0") spawnDevWorker(id);
  return { id };
}

/** Development convenience: one worker process for one row, detached from the request. */
function spawnDevWorker(jobId: string): void {
  const appDir = process.cwd();
  const tsx = path.join(appDir, "node_modules", "tsx", "dist", "cli.mjs");
  try {
    const child = spawn(process.execPath, [tsx, path.join(appDir, "src", "jobs", "worker.ts"), "--job", jobId], {
      cwd: appDir,
      env: process.env,
      detached: true,
      stdio: "ignore",
    });
    child.on("error", (err) => console.error(`[jobs] could not start the dev worker for ${jobId}: ${err.message}; run pnpm jobs:worker`));
    child.unref();
  } catch (err) {
    console.error(`[jobs] could not start the dev worker for ${jobId}: ${err instanceof Error ? err.message : String(err)}; run pnpm jobs:worker`);
  }
}
