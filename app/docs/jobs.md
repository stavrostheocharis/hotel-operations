# Background jobs

Normalising, linking, embedding and importing take seconds to minutes and
must survive a page reload or a dev-server restart. They run in a detached
worker process; the console only writes a row and watches it.

```bash
pnpm jobs:worker --job <id>     # what the app spawns; handy for a stuck job
```

## How a job runs

1. A server action (`src/console/import-actions.ts`: `runJobAction`,
   `loadBatchAction`) calls `enqueueJob()` in `src/jobs/runner.ts`. It
   inserts one `jobs` row under the viewer's tenant (`queued`) and spawns
   `node tsx src/jobs/worker.ts --job <id>` detached, stdio ignored, then
   returns. Nothing in the web process waits.
2. `worker.ts` connects with the admin `DATABASE_URL` and calls `runJob()`
   in `src/jobs/run.ts`: it claims the row (`queued → running`, pid,
   `started_at`), writes `job.started`, dispatches by kind, and every five
   seconds writes `heartbeat_at` plus the log tail and progress
   (`{ step, done, total, message }`). On the way out it writes
   `succeeded` with the result or `failed` with the error, and
   `job.finished`.
3. The page shows `<JobProgress/>` (`src/components/jobs/job-progress.tsx`),
   which polls `GET /api/jobs/[id]` every two seconds while the job is
   queued or running and refreshes the page once when it ends.

Kinds: `normalize` (`normalizeSignals`), `link` (`linkSignals`), `embed`
(`embedSignals`), `import` (load a batch, then normalise, then link),
`audit` (reserved; the audit is computed on view). A partial unique index,
`jobs_one_active_per_kind`, allows one queued or running job per kind and
property; a second request gets the "already running" toast.

The model: `params.llm = true` makes the worker build the OpenAI client from
`OPENAI_API_KEY` in its environment; without it, rules only. The log is
capped at 500 lines in the row.

## When the worker dies

A job `running` with a heartbeat older than 30 s is shown as stalled. A
manager can mark it failed (`markStalled()`), or, for a `queued` job older
than a minute whose worker never started, respawn it (`respawnQueued()`).
Nothing restarts automatically: a half-done import is visible in the batch
and can be re-run; every insert is idempotent on (property, source,
external id).

## Reading jobs

`src/jobs/queries.ts`: `getJob`, `listJobs`, `latestJobs` (the last of each
kind, for the Imports page), `activeJob`. All run under `withTenant()` on
the app connection; the `jobs` table carries the tenant columns and the
`tenant_isolation` policy like every other.

Tests: `src/db/__tests__/jobs.test.ts` runs a link job in-process with the
fake model (claim, progress, result, events), rejects a second active job of
a kind, fails an import whose folder is missing and marks its batch failed,
and marks a stalled job.
