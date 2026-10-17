# The console (step 7, first slice)

Two screens on top of the linked data: the exceptions queue at `/` and one
issue at `/issues/[id]`. Everything is server-rendered; the only
interaction is a supervisor confirming or rejecting a link the engine made.

## What is on screen

**Today (`/today`)** – "What needs a person today?" The header line says
how many records arrived today, by source, and when the last import ran.
Three lists of up to five rows each, with a link to the rest: **Came back
in the last 7 days** (issues reopened, or with a `recurred` outcome, in
the last week), **Open and unassigned** (open issues with no owner, the
ones that came back most first; each row has the assign menu), and
**Verifications due** (checks due today or overdue, with the done form).
Department heads and staff see their department by default ("Mine") and
can switch to all; managers see all.

**Exceptions (`/exceptions`)** – "Which problems are not finished?" Saved
views as tabs with counts: *Needs attention* (reopened, or open with no
owner, or resolved past its recurrence window), *Open*, *Awaiting
verification* (resolved), *Shared cause* (the issue sits on equipment, a
building or a floor), *Closed*, *All*. A toolbar whose state lives in the
URL: search (title, room code or alias, ticket number), department,
category, "only critical", sort (what came back / newest / oldest open /
most reports); 25 rows a page. A row shows the title with "building ›
room · category" under it, the status with a "Back ×n" badge when it
came back, the owner, the last activity, and a menu (open, assign,
schedule a check). The four headline figures and the per-category table
that used to sit above the queue belong to Reports.

**Verifications (`/verifications`)** – "Which fixes must be checked, and
did they hold?" Views: *Due today* (incl. overdue), *This week*, *Mine*,
*Done (30 d)*, *All open*. A row: the place, the issue, when it is due
(overdue in red), the assignee, the status. *Done…* opens the form in a
side sheet: fixed and I checked it (staff evidence), fixed and the guest
confirmed, the problem is back (reopens the issue), or could not check
(moves the date). A check is scheduled when an issue is marked resolved
(on by default: two days later, for the owner), from an issue's *More*
menu, or from a queue row. The sidebar badge on Verifications is the
number due today.


**Signals (`/signals`, `/signals/[id]`)** – "What came in, and did each
record find its problem?" Every record as it arrived, newest first, with
views *Unlinked* (a problem from a source that acts on its own — ticket,
desk, staff, guest message — that sits in no issue), *Today* and *All*,
and a toolbar in the URL (search by text, place or ticket number; source;
category; dates; not English). A row opens the record in a side drawer
(`?record=`; ↑/↓ walk the list): the text with its original, the place
with how it was found and a *Change* picker, category and topic with a
form, which issue it belongs to or — for a supervisor — the likely issues
nearby (same place, the plant serving it, same category close in time)
with a *Link* button each, a search over every issue, and *Create issue*
(the record becomes the first report). A place or classification set by
hand is locked: the next normalisation run leaves it alone
(`signals.locked_fields`). Linking by hand pins the pair to the issue's
first report, so the engine keeps them together.

**Review (`/review`)** – "Are these two records the same problem?" The
pairs the engine was not sure about (rule score between 0.4 and 0.6 after
embeddings and the model, if any), one at a time, side by side: *Same
problem* (S), *Not the same* (N), *Skip* (K). The answer is pinned in
`link_decisions`; when exactly one side already sits in an issue the other
is attached at once, when both sit in different issues the next linking
run merges them, and the engine never asks about that pair again. The last
decisions can be undone. The linker rewrites the pending queue on every
run (`ai_suggestions`, kind `link`, decision `pending`, best first; at
most 300); the sidebar badge is the count.

**Locations (`/locations`, `/locations/[code]`)** – "Where are the
problems?" and "What has happened at this place?" The left column is the
tree: buildings › floors › rooms, then facilities, then equipment, with a
search by code, name or alias and the number of open issues as a muted
count (buildings and floors sum what is below them). `/locations` lists
the buildings, facilities and busy equipment with open, came-back and
total issues. A place's page has the kind, its parent chain as
breadcrumbs, and tabs: *Overview* (its facts, what it is also called,
what serves it — the boiler, the chiller, the lift — or, for equipment,
what it serves), *History* (the issues here, optionally including every
place below, and the records here that belong to no issue), *Rooms* (the
floors or rooms below, red when something is open). Editing is in Settings.

**Settings → Locations (`/settings/locations`)** – which places exist,
what they are also called, what serves what. One list per kind with the
aliases as chips (add, remove) and, for equipment, what it serves (a
dialog with every place to tick). *Add place* creates a room, facility or
piece of equipment under a parent. **Unresolved spellings** is the list
of what staff typed for a place that nothing resolved (`location_method
= none`), grouped and counted with a sample: *Map to…* makes the spelling
an alias of the chosen place and moves every record carrying it there at
once, marked as resolved by alias. Managers and the engineering head may
edit (`settings.locations`); everyone else reads.

**Issue (`/issues/[id]`)** – "What is this problem, who has it, and is it
really fixed?" One line says what, where (and what the place serves),
owner and department, open since when; the root cause sentence under it.
**One primary action per status**: open or reopened → *Assign* (department,
owner, note); assigned → *Mark resolved* (what was done, required; a ticket
reference, optional); resolved or closed unverified → *Record verification*
(a colleague checked it / the guest confirmed / the problem is back, with a
date and a note); verified → nothing. *More* holds change owner, change
status (closed-unverified is a manager's call), edit (title, category,
severity, department) and copy link. Every change writes the issue's
current state to its columns and its history to `events`; notes are events
only (`issue.note`). Tabs:

- *Evidence*: every linked record in time order with source, location,
  topic, the text (English, original underneath when translated), and the
  line "linked by rule: same-place-topic · 90%" that says why it is here.
  The first report is marked; duplicates are marked.
- *Tickets*: the work orders in the issue, with status, closure date,
  technician and closure note.
- *Outcomes*: the recurrence window after the last closure, then "came
  back" (recurred), "no recurrence", "checked by staff" or "guest confirmed",
  with the note a person left.
- *Activity*: the note composer and the issue's events as sentences, newest
  first, with the person's name.

On the side: where the issue sits (the place and its ancestors, what serves
it or what it serves), related issues at the same place, and the people
(owner, department, verified by). An issue the engine regrouped after a
person had touched it shows a notice with a link to the issue that took
its records (`superseded_at`); it leaves the queue but keeps its history.
What survives a linking run is described in [linking.md](linking.md).

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

The actor is the signed-in user's id (`docs/auth.md`); the issue page shows
the person's name next to a confirmed link. Only roles with `links.decide`
(supervisor and above) see the buttons, and the action checks again.

## How it is built

- `src/console/tenant.ts` – `getCurrentTenant()`: the signed-in viewer's
  selected property as a `TenantContext` plus name and timezone (a thin
  wrapper over `requireViewer()`, see `docs/auth.md`).
- `src/console/queries.ts` – read models (`listIssues`, `countIssues`,
  `getKpis`, `getIssue`). Each runs inside `withTenant()` on the app
  connection; the SQL never filters by property, row-level security does.
- `src/console/decisions.ts` – `applyLinkDecision()`, the confirm/reject
  logic above, also under `withTenant()`.
- `src/console/issue-workflow.ts` – assign, resolve, record outcome, change
  status, note, edit: plain functions over the database that check the
  capability and write the state and the event. `issue-actions.ts` wraps
  them as server actions returning `{ok, message}` for the toasts;
  `issue-detail.ts` reads the events, the place and the assignable users.
- `src/components/issues/` – the dialogs (`workflow-actions.tsx`, incl. the
  schedule-a-check dialog), the note composer and the activity list.
- `src/console/verification.ts` – verification tasks: the views, the counts,
  schedule / complete / skip (`verification-actions.ts` wraps them);
  `src/console/today.ts` – the Today digest; `src/console/queries.ts` –
  `queryIssues()` / `countIssueViews()` for the queue.
- `src/components/verifications/done-sheet.tsx`, `src/components/exceptions/`
  (filter bar, row menu), `src/components/console/{view-tabs,pager}.tsx`.
- `src/console/locations.ts` (tree with counts, a place, its history, the
  unresolved spellings), `location-admin.ts` (aliases, serves, map a
  spelling, create, rename) and `location-actions.ts`;
  `src/components/locations/` (tree, browser frame) and
  `src/components/settings/` (tabs, alias editor, serves dialog, map-to,
  add place).
- `src/console/signals.ts` (list, views, record, likely issues, search,
  places) and `signal-actions.ts` (relocate, reclassify, link, create);
  `src/console/review.ts` (pairs, decide, undo) and `review-actions.ts`;
  `src/components/signals/` (filter bar, drawer, record panel, tools) and
  `src/components/review/review-deck.tsx`.
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
