# The data reality check (phase 0)

The paid first step of the engagement (`docs/discovery/04-audit-offer.md`):
a client sends a two-week sample and then the full season export, and gets
back, in writing, whether the records can carry the audit. The check reads
the export folder as delivered, loads nothing into the database, and writes
the go / reshape / stop memo that `docs/discovery/05-go-no-go.md` asks for.

```bash
pnpm db:reality-check --dir=../data/out            # the synthetic season → data/reports/reality-check/
pnpm db:reality-check --dir=/path/to/client/export --out=/path/to/memo
pnpm test:unit                                      # the tests, no database needed
```

Output: `reality-check.md` (the memo) and `reality-check.json` (the same
report as data) in `--out`, default `data/reports/reality-check` (git-ignored,
and outside the export folder so that stays exactly what the client
delivered). The run takes a second or two for a season; no network, no API
key, no Postgres.

## What the memo answers

The sections follow the scorecard in `05-go-no-go.md`.

**Verdict** first: go, reshape or stop, with the reasons and, for a stop,
the stop conditions that hold.

**Export summary** – the nine datasets of the data request
(`02-data-request.md`), which file(s) each came in, rows, date range,
received or missing; the season covered, the occupied room-nights, the row
counts the scorecard's header asks for. Below it, the files recognised with
low confidence (they resembled a dataset without qualifying, and count for
nothing) and the files listed but not parsed (documents, nested JSON
reports, old Excel formats), each with the reason.

**Scorecard** – D1 to D6 with every measure, its value and its colour:

| Dimension | Measures taken here |
|---|---|
| D1 location linkage | work orders and desk complaints whose typed location resolves to the room / asset list |
| D2 closure notes | usable notes, notes naming a part or a cause, closure timestamps, among closed tickets |
| D3 recurrence visibility | 30-day recurrence candidate rate, category taxonomy (count and largest share), 2-hour duplicate rate |
| D4 feedback overlap | survey responses linkable to a stay; reviews with a date of stay (information). Topic overlap and corroboration need the normalisation step and are measured in the audit itself |
| D5 coverage and volume | weeks with tickets / weeks in season, tickets per occupied room-night, ticket count, stay nights / occupied room-nights, occupancy present, rooms typed into tickets that exist in the list |
| D6 personal data | identity columns (by header, never read), free-text records with contact or payment patterns, survey keys found in the stay list |

D7 (commercial reality) is not a data question; the memo says the account
lead fills it.

**Coverage measures** – the same figures in the records-assessment style of
`src/audit/records.ts`, with a note on what each means; then the status
vocabulary of the ticket export with how each spelling was read, and the
location spellings that did not resolve (the start of the alias table).

**Reshaping asks for the client** – one numbered list: the reshape from the
menu in `05-go-no-go.md` for every Amber or Red measure, a line per minimum
field that could not be found ("tell us which column holds it"), missing
datasets, files not recognised, encodings that are not UTF-8, ambiguous
date orders.

**Data gaps log** – the table of the scorecard: gap, dataset, impact on the
deliverable, how the hotel can fix it.

**Files** – one section per table read: format (delimiter, encoding and
BOM, line endings, header row, sheets and whether there is one per month,
JSON shape), row count and date range, the date format of every date
column, the language mix of every free-text column, the field mapping
(data-request field → column, how it matched, fill rate), minimum fields
not found, helpful fields not present, columns not placed.

**Method** – the definitions, so the hotel can argue with a number.

## How the folder is read

`src/reality/read.ts` walks the folder. CSV (`.csv`, `.tsv`, delimited
`.txt`): encoding from the byte-order mark, else UTF-8, else Windows-1253
when the bytes decode to Greek, else Latin-1; line endings counted;
delimiter as the candidate (`;` `,` tab `|`) with the most consistent count
across the first lines; header as the first row of mostly text, distinct
cells, so title lines are skipped. XLSX: per sheet the same header search in
the top 25 rows; sheets with identical columns are read as one table, and
"one sheet per month" when their names are months in English, Greek,
German, French or Italian; sheets with different columns become separate
tables (`file.xlsx#Sheet`). JSON: a table is one list of records, either a
top-level array or an object wrapping exactly one such list (metadata beside
it, at most one level down); the records are flattened one level and their
shapes counted by a discriminator such as `platform`. A document with
several lists of records, or none, is a report rather than a table and is
listed as not parsed with that reason. PDF / DOCX are listed as documents;
`.xls` and archives are listed with the ask to re-save.

Dates (`dates.ts`) are recognised as `YYYY-MM-DD`, `YYYY-MM-DD HH:MM`, ISO
8601 with a zone, `DD/MM/YYYY`, `DD.MM.YYYY`, `DD-MM-YYYY` (each with an
optional time), `Month YYYY`, `YYYY-MM`, `D Month YYYY`, `Month D, YYYY`,
Excel serial numbers and Excel date cells. The day/month order of a slash
date is settled once per column from the values that have a day above 12;
when none does, the Greek order is assumed and the memo says so; when both
orders occur the column is flagged.

## How columns become fields

`catalogue.ts` holds the target schema: every dataset of the data request
with its minimum and helpful fields and the header spellings hotels and
their tools use (English and Greek). `headers.ts` matches each column by
name: exact after normalisation (lower-case, accents stripped, `#` read as
"no"), the same tokens, a multi-word spelling contained in the header, a
single word of the header, then character-bigram similarity. Values that do
not look like the field (a `room` column holding 1–10 scores) halve the
confidence, so the score column goes to "per-topic scores" and "room
number" is reported as not present. A column feeds one field; a field may
take several columns when the data comes split (review text in `positive`
and `negative`, question scores).

A file is taken for a dataset only when, confidently matched (85% or
better):

- at least two of the dataset's **identifying columns** are present (for
  work orders: job id, created at, closed at, status; for stays: stay key,
  arrival, departure; and so on in `catalogue.ts`). A file name never waives
  this: a list that shares a category and a location column with the tickets
  is not the ticket export;
- one of the dataset's **core fields** is present (free text for tickets and
  complaints, a score or comment for surveys, …);
- at least 40% of the minimum fields, and never fewer than three, are
  present, one fewer when the file name names the dataset;
- the mapping score reaches a floor set by the number of minimum fields.

A file that resembles a dataset (two or more minimum fields matched) without
qualifying is reported as **recognised with low confidence**, with the
columns that matched and the reason, and counts for nothing. When several
files qualify for one dataset, the strongest is the dataset's file; the
others stay only when they map the same data-request fields (a second month
of the same export) and are otherwise set aside the same way, so a stray
report never swells the row counts. The rule lives in `eligibility()` in
`headers.ts`; the test drops an old winter-works list and a nested audit
report into a copy of the fixture and checks that the ticket count and the
verdict do not move.

## What counts

- **Resolves**: the typed location matches the list exactly or by a known
  spelling (`roomAliases`, `equipmentAliases` from the seed), or through a
  documented rule of `src/normalize/location-rules.ts` (room number in the
  text, building letter, villa number, plant keyword). Both figures are in
  the memo; the scorecard uses the second.
- **Usable closure note**: non-empty, not a placeholder (`done`, `ok`,
  `έγινε`, …), at least four letters, not a copy of the description.
  **Names a part or a cause**: a replacement verb or a part word, by
  keyword in English, Greek and Greeklish; a floor, not a ceiling.
- **Closed**: the status reads as closed (`Closed`, `Done`, `Completed`,
  `ολοκληρώθηκε`, …); without a status column, a closure time.
- **Recurrence candidate**: closed ticket, same resolved place and same
  category again within 30 days of the closure. **Duplicate**: same place
  and category within two hours of an earlier ticket.
- **Season**: the occupancy report's range, else first arrival to last
  departure, else the ticket range. Coverage is ISO weeks with a ticket over
  ISO weeks in the season.
- **Decision**: stop if work orders are missing, D1 work orders Red, fewer
  than 600 tickets, or season coverage Red; else reshape if any dimension is
  Red, three or more are Amber, a must-have dataset is missing, or a
  scorecard measure could not be taken (a minimum field not found makes the
  measure "not assessable", which is a reshape ask, not a stop); else go.
  Thresholds are the first-version defaults of `05-go-no-go.md` and live in
  one table in `src/reality/scorecard.ts`.

On the synthetic season the verdict is **go** with D5 Amber (1,148 tickets,
0.026 per occupied room-night). Renaming the location and closure-note
headers and dropping the reservation number from the surveys turns it into
**reshape** with three asks naming exactly those columns; the test does that.

## Files

```
src/reality/
  types.ts        RealityReport and its parts
  catalogue.ts    the data request as a target schema: datasets, fields, spellings; status and placeholder vocabularies
  detect.ts       encoding / BOM, line endings, delimiter, header row, one-sheet-per-month
  dates.ts        date formats, per-column day/month order, ISO weeks
  read.ts         readExportFolder(): CSV / XLSX / JSON → tables of string cells (the only I/O)
  headers.ts      header matching and dataset classification
  locations.ts    the room / asset list as a LocationIndex; resolveTyped()
  analyze.ts      analyze(): the facts, pure
  scorecard.ts    the rules with thresholds, dimensions, decision, asks, gaps
  markdown.ts     renderMemo()
  index.ts        buildReport(), runRealityCheck()
  __tests__/reality.test.ts   the synthetic season and its broken copy
src/db/scripts/reality-check.ts   the CLI
```

## Not in this step

- Topic overlap and corroboration (D4): they need the normalisation step.
- The 200-ticket two-coder sample for closure notes: the check uses the
  placeholder and part-word rules on every closed ticket instead.
- Reading PDF or DOCX; documents are listed only.
- Anything that writes to the database or calls a model.
