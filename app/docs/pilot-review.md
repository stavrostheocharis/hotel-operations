# Pilot readiness review

Date: 2026-10-18. Code: branch `reports-settings-polish` (steps 1–7 of the
control tower complete). Method: a walkthrough of every screen as GM, staff
and read-only on the dev server (desktop and phone width), plus three
independent read-only code reviews (security and authorisation; data
pipeline, jobs and imports; screens, copy and role gating). Every claim
below was checked against the code; paths are relative to `app/`.

**Verdict.** As a demo on the synthetic season the app is complete and
coherent. It is not ready for a real hotel's exports yet: the nightly
re-import, guest identity, the job worker and the deployment itself each
need work before the first client file goes in. None of it is large; most
of section A is a few days.

**Status.** The six blockers of section A are fixed on branch
`pilot-blockers`, one commit each, with the fix noted under each item.
Section B and C stand as written.

## A. Blockers: change before any real data goes in

1. **Updated records never land.** `src/import/signals.ts:44-48` inserts
   with `onConflictDoNothing` on (property, source, external_id). A ticket
   exported open on Monday and closed on Wednesday keeps `mapped.closed_at`
   null forever, so issues never resolve from exports and the "did the fix
   hold" logic starves. Fix: `ON CONFLICT DO UPDATE SET mapped = excluded.mapped`
   (the immutability trigger allows it; keep the first `raw`), record the
   last batch that saw the row, re-normalise rows whose `mapped` changed.
   **Fixed on `pilot-blockers`:** `insertSignalsScrubbed` upserts `mapped`
   when it differs, resets `normalized_at`, writes `signal.updated`, and
   the wizard counts new / updated / unchanged per source
   (`src/db/__tests__/import.test.ts`, "a later export of the same records").
2. **Guest identity reaches public tables.** PMS signals use the raw
   reservation number as `external_id` and store it in `mapped.stay_key`
   (surveys too), with nationality (`src/import/loader.ts:172-182`); `raw`
   keeps every column although the reality check already lists the
   identity columns per file (`identityColumns`, never read by the loader);
   technician names sit in `mapped.assigned_to` and `actions.actor`. Fix:
   `stayRef` as the PMS external id, drop identity columns per the report
   before storing `raw`, pseudonymise staff names.
   **Fixed on `pilot-blockers`:** both loaders use the stay pseudonym as
   the PMS external id, keep reservation number and nationality out of
   `mapped`, drop the flagged identity columns and the `stay_key` /
   `assigned_to` columns from `raw`, and store technicians as `staff_…`
   pseudonyms (`staffRef`). Roles such as "created by" stay as the role
   code the data request asks for.
3. **The job worker cannot run in a deployed build.** `src/jobs/runner.ts:39-49`
   spawns `node node_modules/tsx/dist/cli.mjs src/jobs/worker.ts` detached
   from the web process: it needs `src/`, `tsx`, and `dotenv` (a
   devDependency imported by `worker.ts` and `seed.ts`), dies with the
   container, runs on whichever replica took the click, reads uploads from
   local disk, and fails invisibly (the job stays `queued`). Replace it with
   one long-lived worker service built from the same image, polling `jobs`
   with `FOR UPDATE SKIP LOCKED`, with a sweeper that fails stale jobs and
   resets their batch; put uploads on shared storage.
   **Fixed on `pilot-blockers`:** `pnpm jobs:worker` is a long-lived
   service (`src/jobs/worker.ts`) that claims the oldest queued job with
   `FOR UPDATE SKIP LOCKED`, runs it with every row write conditional on
   the row still being `running` (a job a person marked failed stops at
   its next heartbeat), and sweeps dead jobs and batches left `loading`
   once a minute; `--once` drains the queue for cron. The web app only
   inserts the row; the one-shot spawn survives in development only
   (`JOBS_SPAWN=0` turns it off), with its error logged. `dotenv` is a
   dependency. The page says when nothing has picked a job up for two
   minutes. Shared storage for uploads is part of the deployment item.
4. **No deployment story.** No Dockerfile, no production notes; the DB
   roles are created with literal passwords (`drizzle/0002:16-22`),
   `STAY_REF_SECRET` falls back to `"dev-only-change-me"`
   (`src/db/scripts/lib/stay-ref.ts:9`), no security headers in
   `next.config.ts`, `DATA_DIR`/`UPLOADS_DIR` derive from `import.meta.url`
   unless set. Needed: image, HTTPS, env checklist with startup assertions
   (no default passwords, secret set), migrations on deploy, backups, log
   collection, the worker from item 3.
   **Fixed on `pilot-blockers`:** `app/Dockerfile` (web, worker and
   migrations from one image), `docker-compose.prod.yml` with a shared
   uploads volume, `/api/health`, `docs/deploy.md` with the environment
   checklist and day-two notes; production refuses to start with the
   development role passwords, without `STAY_REF_SECRET`, or without
   `UPLOADS_DIR`; security headers (`X-Frame-Options`, `frame-ancestors`,
   `nosniff`, referrer and permissions policies, HSTS in production);
   "Import the demo folder" is offered in production only when `DATA_DIR`
   points somewhere. Backups, TLS and log shipping are the operator's,
   documented.
5. **A Greek client's places collapse.** `slugCode` keeps `[A-Z0-9]` only
   (`src/import/loader.ts:358-365`): Πισίνα, Εστιατόριο, Σπα all become
   code `X` and merge into one facility; buildings likewise. The `serves`
   parser and the root-cause rules are hard-wired to the demo resort's
   codes (`src/db/scripts/lib/locations.ts:132-161`, `LIFT-1`,
   `BUILDING_SCOPED_TOPICS`), so a real property gets no equipment links.
   Transliterate or hash codes, make the serves parser data-driven.
   **Fixed on `pilot-blockers`:** codes are transliterated (ELOT-style,
   `src/db/scripts/lib/codes.ts`: Πισίνα → `PISINA`) with a short hash
   when another place holds the code; `parseServes` knows only the
   property's own buildings and facilities (codes, names, aliases,
   distinctive name words, "all rooms in …" in English and Greek) and no
   demo code; shared plant is matched by equipment type (`boiler`,
   `pump`, `chiller`, `elevator`, `access_control`) in the linker's
   cluster rule, the root-cause step and the normaliser. The demo season
   links and audits exactly as before.
6. **Two small auth bugs with user-facing effect.** `safeNext` accepts
   `/\evil.com` (open redirect, `src/auth/actions.ts:34-37` and the sign-in
   page); a user whose only property access is removed loops between
   `/sign-in` and `/today` forever (`src/auth/viewer.ts:33`,
   `src/app/(auth)/sign-in/page.tsx:34`).
   **Fixed on `pilot-blockers`:** `safeReturnPath()` honours only a path
   on this site (one slash, then neither slash nor backslash, no scheme,
   no control characters) in the action and on the sign-in page; a signed
   in person with no property lands on `/no-access`, which says so and
   offers Sign out.

## B. Before the pilot starts: the first week of real use would hit these

Data and rebuilds

- The nightly rebuild overwrites `resolved_at`, title, category and
  severity on claimed issues even when a person set them
  (`src/link/persist.ts:245-262`); the status itself survives. Deleting an
  "untouched" unclaimed issue cascades to its open verification tasks
  (`humanState` ignores tasks, `persist.ts:130,171`).
  **Fixed on `pilot-before`:** fields named in `issue.edited` keep the
  person's value, the resolved date stays while a person's status stands,
  and an open check marks its issue as touched (superseded, never
  deleted). Tests in `issue-workflow.test.ts`.
- A dead worker leaves the batch `loading` (only Discard and re-upload);
  marking a live job failed lets a second rebuild start concurrently;
  final status and heartbeat writes are unconditional; a 100 MB CSV parsed
  synchronously looks stalled after 30 s.
- Row-hash external ids (compensation always; complaints, surveys, reviews
  without an id) duplicate on any edit or column reorder and collapse
  identical rows. `validateMapping` is never called at load, so a renamed
  column drops rows silently. `monthFirst` is decided per file, not per
  column; two-digit years are dropped; unparsed naive dates fall back to
  the server's zone. Room codes collide across buildings.
- The reality check and the upload run inside the web process over whole
  files in memory; PaaS request limits will cut them.
- Translations: the demo DB was normalised rules-only, so 1,780 of 3,330
  text records show in German, Greek, French or Italian with no marker
  (`coalesce(text_en, text_original)`). Run normalisation with the model
  before the pilot and show "not translated" when `text_en` is null.

Roles and gating

- Read access is nav-only: any role can open `/settings/users` (every
  colleague's email and last sign-in), `/imports` (server paths, job
  errors), the memo and the audit JSON by URL. `docs/auth.md` says every
  role sees every screen; the nav says otherwise. Pick one and enforce it
  on the page.
  **Fixed on `pilot-before`:** the sidebar map is the boundary
  (`canSee`), every gated page and route enforces it, and `docs/auth.md`
  now says who sees what.
- Read-only and non-engineering department heads get full forms, just
  disabled; Exceptions shows "Assign…" on rows the server will refuse
  (`exceptions/page.tsx:77` checks without department context); the Users
  table offers "Deactivate" and "Remove access" on your own row; "Load
  anyway" is gated on `settings.users` while the copy says group admin
  only; "Import the demo folder" appears for a real GM whenever `data/out`
  exists on the server, with no confirmation.
  **Fixed on `pilot-before`:** read-only summaries instead of disabled
  forms, tabs only for what the role may open, Assign… per row with the
  department and owner the server checks, no self-actions in Users, a
  group-admin-only `imports.override`, the placeholder button only for
  roles that may write; the demo-folder card already depends on
  `DATA_DIR` and its copy no longer mentions the generator.
- A GM can administer every user in the group, not only their property
  (`loadTarget` by id under group-scoped RLS); matters only with more than
  one property. No self-service password change, so admins know every
  password.
  **Fixed on `pilot-before`:** a GM sees and acts on this property's
  members and the group admins only (`userInScope`); "Change password…"
  in the user menu.
- Raw `Error.message` strings and absolute server paths reach toasts and
  pages for every role.
  **Fixed on `pilot-before`:** library errors are logged and replaced by
  one sentence (`failureMessage`); batch pages show the folder's name,
  not its path.

Dead ends in the UI

- Confirm / "Not this issue" on the Evidence tab posts a plain form:
  no pending state, no toast, and `decideLink` throws instead of returning
  a result. No `error.tsx` or `not-found.tsx` anywhere, so a stale shared
  link shows Next's default page outside the shell.
  **Fixed on `pilot-before`:** `LinkDecision` posts through
  `useActionState` with a pending state and one toast, and `decideLink`
  returns a result instead of throwing; `(app)/error.tsx`,
  `(app)/not-found.tsx` and a root `not-found.tsx` speak the dictionary's
  words inside the shell.
- Arrow keys inside the Signals drawer move to another record while the
  focus is in a Select or Command list (`record-drawer.tsx:34-42`); the
  Review keys S/N/K fire from any focused button.
  **Fixed on `pilot-before`:** both listeners ignore keys aimed at a
  control (inputs, selects, buttons, lists, menus, comboboxes, dialogs) and
  modifier combinations; the drawer prevents the page scroll.
- "Clear filters" leaves the old text in the boxes and drops the current
  view; "Copy link" throws on an http:// LAN deployment (no clipboard
  outside secure contexts, no fallback); the Review "Undo" result is
  discarded.
  **Fixed on `pilot-before`:** the filter bars remount on every URL change
  (so Clear empties the boxes) and Clear keeps `?view=`; Copy link falls
  back to the old copy command and, failing that, shows the link to select;
  Undo reports its result.

Infrastructure

- `src/db/index.ts` keeps the pools as module singletons: every HMR in dev
  created a new pool and the dev database hit 100 connections during this
  review (97 idle). Guard with `globalThis` in development, size `max` for
  the web and worker processes, consider pgbouncer.

Words

- Categories and sources are spelled three ways (`hvac` / "Air
  conditioning" / "desk complaints"); one state has five names (Reopened,
  Back ×n, Came back, recurring); check vs verification, record vs signal,
  place vs location. Developer vocabulary on hotel screens: engine, worker,
  embedding, linking run, scorecard, reshape, "what to ask the client".
  Strings outside the dictionary that `check:i18n` cannot see: relative
  times, metadata titles, verdict colours shown as badge words, "owner",
  "unclassified". Six date formats across reports. Copy written for the
  developer ("as the generator wrote it", "generated {date} · {version}").
  The settings hint promises "shown on Today when they are late" for the
  export time; Today does not do that.

Phones

- Locations stacks the 70 vh tree above the content, so every place page
  opens on the tree; Verifications keeps five no-wrap columns; the batch
  header shows the full server directory path.

## C. During the pilot: first month

- Mapping editor and memory across batches (every nightly batch re-derives
  the mapping; a mis-mapped column is a code change). Occupancy never
  updates. Alerts on failed jobs and on an export that is late against the
  property's import time (today the time is only displayed).
- Sessions slide forever (add an absolute lifetime); the sign-in limiter is
  per process and per email; `auth_set_password` and `auth_create_session`
  take any user id (add a group check inside the functions); per-property
  role overrides are not enforced on entity actions (nothing creates
  overrides yet); the worker resolves the property by code without the
  group; the PII scrubber turns 10-digit folio numbers starting with 2 into
  "[phone]"; status races between the actions and the worker.
- Accessibility: labels without `htmlFor` in the user dialogs, tables
  without header rows (jobs, files, scorecard), pager arrows without names,
  controls under 40 px in the tree and alias chips, the categories select
  uses an undefined `rounded-input` utility. The list skeleton draws a
  second page title under the real one on every navigation.
- Dead dictionary keys and a missing Rename UI for places; review decisions
  badged with issue-status words ("Verified" for "same problem"); "decided
  this week" capped at 10; 300 pending review pairs on day one (triage with
  the model judge before handing the queue to a supervisor); future-dated
  demo records show "in 3 d".

## What held up

Tenant isolation (no admin connection in any request path, RLS forced on
every tenant table, no raw SQL), every write asserting a capability with
the right context, session and password hygiene, upload sanitising,
secrets handling, CSRF; idempotent loads and crash recovery by re-running a
batch; the rebuild keeping human links, notes, outcomes and statuses; date
handling (Excel serials, DST, month names); every page under one second
with 13,000 signals; no horizontal overflow at phone width; every JSX
string in the dictionary.
