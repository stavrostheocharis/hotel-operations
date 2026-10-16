# The console (step 7, first slice)

Two screens on top of the linked data: the exceptions queue at `/` and one
issue at `/issues/[id]`. Everything is server-rendered; the only
interaction is a supervisor confirming or rejecting a link the engine made.

## What is on screen

**Exceptions (`/`)** – the queue, ranked by what came back: reopen count,
then size, then recency.

- Four figures at the top: issues currently reopened, the reopen rate
  (issues ever reopened over issues that had a closure), repeats per 1,000
  occupied room-nights (`outcomes.kind = 'recurred'` over
  `occupancy_daily.rooms_occupied`), and the median hours from first signal
  to ticket closure.
- The same per category (issues, reopened, median hours), for categories
  with at least five issues.
- Filters: all · reopened · open · shared cause (issue sits on equipment, a
  building or a floor) · closed, unverified. Each shows its count.
- The table: title, where the cause sits, status, reopens, signals, which
  sources contributed, first → last signal.

**Issue (`/issues/[id]`)** – the root cause sentence, the location, four
figures (signals, reopens, episodes, tickets closed), then:

- *Evidence*: every linked record in time order with source, location,
  topic, the text (English, original underneath when translated), and the
  line "linked by rule: same-place-topic · 90%" that says why it is here.
  The first report is marked; duplicates are marked.
- *Tickets*: the work orders in the issue, with status, closure date,
  technician and closure note.
- *Outcomes*: "came back" (recurred), "no recurrence", or a guest / staff
  confirmation.

## Confirm and reject

Issues are rebuilt from scratch on every linking run, so a decision cannot
be stored on the issue. It is stored on the *pair of signals* in
`link_decisions` (`signal_a < signal_b`, one row per pair per property,
`link` or `unlink`, who decided, optional note):

- **Confirm** marks the link `method = human`, confidence 1.000,
  `decided_by` the person, and pins the signal to the issue's first report
  with a `link` decision.
- **Not this issue** removes the signal from the issue now and writes an
  `unlink` decision against every other current member, so the next rebuild
  cannot put them back together through any rule.

The linker reads the table at the start of a run: `unlink` pairs are dropped
from the candidates (rule and review-attach alike), `link` pairs are added
as accepted candidates with `rule = human`. Both write an event
(`issue.link_confirmed` / `issue.link_rejected`) with the person as actor.

Until sign-in exists the actor is the literal `supervisor` and the property
is `DEMO_PROPERTY_CODE` from `.env` (default `ASTRAEA`).

## How it is built

- `src/console/tenant.ts` – `getCurrentTenant()`: looks the demo property
  up on the admin connection (the app role sees nothing before a tenant
  context is set), returns the `TenantContext` plus name and timezone.
  Wrapped in `React.cache` so one request resolves it once.
- `src/console/queries.ts` – read models (`listIssues`, `countIssues`,
  `getKpis`, `getIssue`). Each runs inside `withTenant()` on the app
  connection; the SQL never filters by property, row-level security does.
- `src/console/decisions.ts` – `applyLinkDecision()`, the confirm/reject
  logic above, also under `withTenant()`.
- `src/console/actions.ts` – the `'use server'` action the buttons post to;
  it calls `applyLinkDecision` then `refresh()`.
- `src/console/format.ts` – date, duration and label formatters, the
  status → badge map.
- `src/components/console/` – the shell (header + nav) and the status /
  source badges. Everything else is the restyled shadcn set in
  `src/components/ui/`.
- Pages: `src/app/page.tsx`, `src/app/issues/[id]/page.tsx`. Both render
  the frame immediately and stream the data behind a `<Suspense>` boundary
  (`searchParams` / `params` are awaited inside it, as Cache Components
  require).

Tests: `src/db/__tests__/console.test.ts` runs the read models through the
app role, then rejects a link, re-links, and checks the two signals stay
apart; confirms a link and checks the row is marked human and pinned.

## Not in this slice

- Sign-in, users, property switching (the demo property is fixed).
- Assigning an owner, changing status by hand, adding a note.
- Verification tasks ("check room 280 tomorrow") and the staff digest.
- Charts; the figures are numbers only.
