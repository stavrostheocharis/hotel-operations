# Background jobs

Normalising, linking, embedding and importing take seconds to minutes and
must survive a page reload or a dev-server restart. They run in a detached
worker process; the console only writes a row and watches it.

```bash
pnpm jobs:worker              # the worker service: run until stopped
pnpm jobs:worker --once       # drain the queue, then exit (cron, CI)
pnpm jobs:worker --job <id>   # one job by id
```

## How a job runs

1. A server action (`src/console/import-actions.ts`: `runJobAction`,
   `loadBatchAction`) calls `enqueueJob()` in `src/jobs/runner.ts`. It
   inserts one `jobs` row under the viewer's tenant (`queued`) and returns.
   Nothing in the web process does the work. In development only, where
   nobody runs the service, a one-shot worker is spawned for the row so the
   wizard still moves (`JOBS_SPAWN=0` turns that off).
2. The worker service (`src/jobs/worker.ts`, `pnpm jobs:worker`, one or
   more processes, the migrator connection) polls the table every two
   seconds and claims the oldest queued row with `FOR UPDATE SKIP LOCKED`
   (`claimNextJob()`), so two workers never take the same job. It then runs
   `runClaimed()` in `src/jobs/run.ts`: `job.started`, the kind's work,
   every five seconds `heartbeat_at` plus the log tail and progress
   (`{ step, done, total, message }`), then `succeeded` with the result or
   `failed` with the error and `job.finished`. Every write to the row is
   conditional on it still being `running`: a job a person marked failed
   stops at its next log line and never writes over their decision.
3. The page shows `<JobProgress/>` (`src/components/jobs/job-progress.tsx`),
   which polls `GET /api/jobs/[id]` every two seconds while the job is
   queued or running and refreshes the page once when it ends. A job still
   queued after two minutes says that no worker seems to be running.

Kinds: `normalize` (`normalizeSignals`), `link` (`linkSignals`), `embed`
(`embedSignals`), `import` (load a batch, then normalise, then link),
`audit` (reserved; the audit is computed on view). A partial unique index,
`jobs_one_active_per_kind`, allows one queued or running job per kind and
property; a second request gets the "already running" toast.

The model: `params.llm = true` makes the worker build the OpenAI client from
`OPENAI_API_KEY` in its environment; without it, rules only. The log is
capped at 500 lines in the row.

In production the worker is a second process from the same image
(`docs/deploy.md`); uploads must be on storage both processes see
(`UPLOADS_DIR`).

## When the worker dies

A job `running` with a heartbeat older than two minutes is shown as
stalled; a manager can mark it failed (`markStalled()`), which also fails
the import batch it was loading so the wizard offers Load again. The
worker's sweeper (`sweepStalled()`, once a minute) does the same on its
own for jobs silent for ten minutes, and fails any batch left `loading`
by a job that already ended. Nothing restarts automatically: a half-done
import is visible in the batch and can be re-run; every insert is
idempotent on (property, source, external id).

## Reading jobs

`src/jobs/queries.ts`: `getJob`, `listJobs`, `latestJobs` (the last of each
kind, for the Imports page), `activeJob`. All run under `withTenant()` on
the app connection; the `jobs` table carries the tenant columns and the
`tenant_isolation` policy like every other.

Tests: `src/db/__tests__/jobs.test.ts` runs a link job in-process with the
fake model (claim, progress, result, events), rejects a second active job of
a kind, fails an import whose folder is missing and marks its batch failed,
claims queued jobs oldest first and never twice, stops a job a person
marked failed without overwriting their decision, and sweeps a dead job
with the batch it left loading.
