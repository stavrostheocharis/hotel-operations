# The season audit (step 8)

The paid winter deliverable from the discovery kit
(`docs/discovery/04-audit-offer.md`), generated from the linked data. One
run gives the written report, the winter-works spreadsheet and the raw
figures; the console shows the same thing at `/audit`.

```bash
pnpm db:audit                      # data/reports/audit/{audit.md, winter-works.csv, audit.json}
pnpm db:audit --fake-llm           # with a deterministic summary paragraph
pnpm db:audit --llm                # with a summary written by the reasoning model
pnpm db:audit --from=2026-07-01 --to=2026-08-31 --label="High season 2026" --out=/tmp/audit
```

`/audit` in the console renders the report for the demo property, with
`?from=&to=` to narrow the window; the toolbar gives Print (the PDF),
Markdown, the winter-works CSV and JSON through `/audit/export?format=`.

## What the report contains

The sections are the seven deliverables of the offer, in order.

**Baseline** – the four numbers the next season is measured against:
repeat complaints per 1,000 occupied room-nights (`outcomes.kind =
'recurred'` over `occupancy_daily.rooms_occupied`), the share of closed
tickets that held for 30 days, the share of issues reopened after a
closure, and the median hours from ticket to closure.

**1. Recurring failures by room, building and equipment** – issues that
came back at the same place: two or more *episodes* (live reports more
than seven days apart) or at least one *reopen* (a live report after a
closure, inside the recurrence window). Ranked by episodes + reopens, then
by guest reports. Shared-plant issues appear once, at the cause (the
boiler, the chiller, the building), with the number of distinct rooms their
reports came from. Also a count of issues and recurring issues by kind of
place.

**2. Fixes that did not hold** – every ticket closed in the window, and
whether a live report of the same issue arrived within 7, 30 and 90 days
of the closure. By category and by month. Never by technician: the SQL does
not read `actions.actor`, and the markdown test checks that no staff code
appears in the output.

**3. Time to resolve** – ticket creation to closure, median and 90th
percentile, by category and by month, plus the first half of the season
against the second (the seasonal-staff effect).

**4. Reviews and surveys tied to operational causes** – for desk
complaints, surveys and reviews that name a problem: how many were linked
to an issue, and how many of those issues had a ticket. The fifteen topics
guests write about most, each with its ticket share and average score
(survey *overall* and review score on a ten-point scale). Topics with at
least three mentions and a ticket share under 25% are the *silent* list,
with two quoted examples each. Survey scores for guests whose stay was
linked to an issue against everyone else.

**5. Winter-works list** – the recurring issues ranked by

    priority = (episodes + reopens) × (1 + guest reports) × (1 + repeat tickets)

where *repeat tickets* are tickets raised after the issue's first closure
(visits the first fix did not prevent). Each item carries an evidence line
written to be pasted into a budget request. Top 20, also as the CSV.

**6. Records assessment** – twelve measures of the exports (closure notes,
locations resolvable, 'Other' category, status spellings, closed without a
time, desk complaints with a place / an agent note / a ticket, survey
comments reaching a stay, reviews naming a place, language mix), each
with a verdict (good / weak / poor / info) from the thresholds in
`src/audit/records.ts`, and the five changes to logging practice: the
recommendations attached to the poor and weak measures, topped up from a
standing list.

**Volume** – records by source and by language, occupied room-nights.

## The narrative

With `--llm` the reasoning model (`OPENAI_MODEL_REASONING`, default
`gpt-5.5`) writes a summary of three to five sentences and three to six
highlights from a compact JSON of the figures, under a system prompt that
forbids numbers not in the facts and any mention of a person or a role's
performance. The output is stored on the report with the model id and
`audit-narrative-v1`, and the markdown says so under the summary. The page
and the export never call the model; `--fake-llm` produces the same shape
deterministically for tests.

## Files

```
src/audit/
  types.ts        AuditReport and its sections
  report.ts       buildAuditReport(): the queries and the assembly, under withTenant()
  records.ts      the twelve measures, thresholds, verdicts, recommendations
  markdown.ts     renderMarkdown(), renderWinterWorksCsv(), shared formatters
  narrative.ts    Narrator interface, OpenAI (AI SDK) and fake implementations
src/db/scripts/audit.ts          the CLI
src/app/audit/page.tsx           the page
src/app/audit/export/route.ts    md / csv / json
src/db/__tests__/audit.test.ts   consistency checks on the synthetic season
```

## Definitions used

- *Live report*: a desk complaint, ticket, staff report, guest message or
  compensation; surveys and reviews arrive too late to count as "it
  happened again".
- *Closure*: a ticket with a closure time in the export. Tickets marked
  closed without a time are counted in the records assessment and nowhere
  else.
- *Window*: property-local calendar days, `season_open..season_close`
  from the property record unless overridden. Records are counted by when
  they occurred, closures by closure time, tickets by creation time, issues
  by opening time.

## Not in this step

- Cost of failure in money. The offer ranks by "recurrence × guest impact ×
  cost of failure"; cost is represented by repeat tickets until a property
  gives us visit and compensation costs.
- Charts. The figures are tables; the page prints as the PDF.
- A per-building or per-floor breakdown of the baseline.
