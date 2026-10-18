import "dotenv/config";
import { assertNotDefaultPassword, createDb } from "@/db";
import { claimNextJob, runClaimed, runJob, sweepStalled } from "./run";

/**
 * The worker service: `pnpm jobs:worker`. One long-lived process (or
 * several: claims use FOR UPDATE SKIP LOCKED) on the migrator connection,
 * polling the jobs table, running what it finds, and sweeping jobs whose
 * process died. Stops cleanly on SIGTERM after the job in hand.
 *
 *   pnpm jobs:worker              # run until stopped
 *   pnpm jobs:worker --once       # drain the queue, then exit (cron, CI)
 *   pnpm jobs:worker --job <id>   # one job by id (what the dev server spawns)
 */
const POLL_MS = Number(process.env.JOBS_POLL_MS ?? 2_000);
const SWEEP_EVERY_MS = 60_000;

const stamp = () => new Date().toISOString().slice(11, 19);
const say = (line: string) => console.log(`${stamp()} ${line}`);

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  assertNotDefaultPassword(url, "DATABASE_URL");
  const db = createDb(url, { max: 3 });
  const one = process.argv.find((a) => a.startsWith("--job="))?.split("=")[1] ?? (process.argv.includes("--job") ? process.argv[process.argv.indexOf("--job") + 1] : undefined);
  const once = process.argv.includes("--once");
  let stopping = false;
  const stop = (signal: string) => {
    if (!stopping) say(`${signal}: finishing the job in hand, then stopping`);
    stopping = true;
  };
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));

  try {
    if (one) {
      const res = await runJob(db, one, { log: say });
      say(`job ${one}: ${res.status}${res.error ? ` (${res.error})` : ""}`);
      if (res.status === "failed") process.exitCode = 1;
      return;
    }
    say(`worker started (pid ${process.pid}, poll ${POLL_MS} ms${once ? ", once" : ""})`);
    let lastSweep = 0;
    while (!stopping) {
      if (Date.now() - lastSweep > SWEEP_EVERY_MS) {
        lastSweep = Date.now();
        const swept = await sweepStalled(db).catch((err) => {
          say(`sweep failed: ${err instanceof Error ? err.message : String(err)}`);
          return { jobs: 0, batches: 0 };
        });
        if (swept.jobs || swept.batches) say(`swept ${swept.jobs} stalled job(s), ${swept.batches} stuck batch(es)`);
      }
      const job = await claimNextJob(db);
      if (!job) {
        if (once) break;
        await new Promise((r) => setTimeout(r, POLL_MS));
        continue;
      }
      say(`job ${job.id}: ${job.kind} for property ${job.propertyId}`);
      const res = await runClaimed(db, job, { log: (l) => say(`  ${l}`) });
      say(`job ${job.id}: ${res.status}${res.error ? ` (${res.error})` : ""}`);
    }
    say("worker stopped");
  } finally {
    await db.$client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
