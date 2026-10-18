# The app, screen by screen

One screen answers one question for one person. Dense numbers live in
Reports; everything else is a short list with one primary action. Every
string comes from `src/i18n/en.ts` (`pnpm check:i18n` proves it), every
status is a word with a colour, and every write goes through a server
action that re-checks the viewer's capability (`docs/auth.md`).

| Route | Question | For | Doc |
|---|---|---|---|
| `/sign-in` | Who are you? | everyone | `auth.md` |
| `/today` | What needs a person today? | GM, duty manager, department head | `console.md` |
| `/exceptions` | Which problems are not finished? | department heads, GM | `console.md` |
| `/issues/[id]` | What is this problem, who has it, is it really fixed? | whoever owns it | `console.md` |
| `/verifications` | Which fixes must be checked, and did they hold? | supervisors, staff | `console.md` |
| `/signals`, `/signals/[id]` | What came in, and did each record find its problem? | supervisors | `console.md` |
| `/review` | Are these two records the same problem? | supervisors | `console.md`, `linking.md` |
| `/locations`, `/locations/[code]` | Where are the problems? What happened at this place? | engineering, GM | `console.md` |
| `/reports` | What did the season teach us, and are we getting better month by month? | GM, owner | `audit.md` |
| `/reports/audit` (+ `/export`) | The season audit, printable | GM, owner | `audit.md` |
| `/reports/monthly` (+ `/export`) | One table, months as rows, plus the same per category; CSV | GM, owner | below |
| `/imports`, `/imports/new`, `/imports/[batchId]` | Did the latest export get in, and what did it find? | GM, group admin | `imports.md`, `jobs.md` |
| `/settings` | Name, time zone, season, when the export is expected | GM, group admin | below |
| `/settings/users` | Who can sign in, and what they may do | GM, group admin | below |
| `/settings/locations` | Places, aliases, what serves what, unresolved spellings | engineering, GM | `console.md` |
| `/settings/categories` | Recurrence windows and default departments per category | GM, group admin | below |
| `/copilot`, `/guest-qr` | What phases 3 and 4 will bring | everyone | – |

## Monthly report

`src/console/reports.ts` → `buildMonthlyReport()` uses the season audit's
definitions (`src/audit/report.ts`), per month of the season (or of
`?from&to`): records that arrived (everything but the PMS), issues whose
first record falls in the month, `issue.reopened` events, repeat findings
(`outcomes.kind = 'recurred'`) per 1,000 occupied room-nights, ticket
closures and how many had no new report at the same place within 30 days,
the median hours from a ticket's creation to its closure, issues verified,
and issues closed without verification (resolved and the window passed).
The per-category table carries the same measures. The CSV
(`/reports/monthly/export?format=csv`) is semicolon-separated with a BOM
for Greek-locale Excel; `format=json` gives the data.

## Property settings

`properties.settings` (jsonb; `src/console/property-settings.ts`):

```json
{ "recurrenceWindows": { "plumbing": 45 }, "defaultDepartments": { "noise": "front_office" }, "importTime": "06:10" }
```

- **Recurrence windows** – days a ticket closure must hold before the
  problem counts as closed unverified; the linker reads them at every run
  (`buildIssue(…, settings)`), defaults: plumbing 90, HVAC 60, housekeeping
  7, F&B 14, facilities 30, everything else 30.
- **Default departments** – prefilled in the Assign dialog when an issue
  has no department yet.
- **Import time** – when the nightly export is expected; once that time
  has passed in the property's zone with no import since, Today says so.

Name, time zone (validated with `Intl`), season open/close live in their
own columns. Every save writes a `property.settings_changed` event.

## Users and roles

`src/console/settings.ts` lists the group's users with their access at the
selected property (a membership, or "whole group" for group admins);
`settings-actions.ts` adds a user (name, email, role, department, an
initial password hashed with scrypt and stored through
`auth_set_password`, a membership at the property), changes role and
department, resets a password (which signs their sessions out), grants or
removes access at the property, deactivates and reactivates. Rules:
`settings.users` is group admin, or GM for every role but group admin;
nobody edits their own role, access or activity. Events: `user.created`,
`user.updated`, `user.deactivated`.

## Later phases

`/copilot` and `/guest-qr` are one card each: the phase, what it will do,
what the property must provide, and "Tell us you want this early", which
writes a `feature.requested` event with the person as actor.
