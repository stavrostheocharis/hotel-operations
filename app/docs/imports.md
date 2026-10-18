# Imports: a client's exports into the database

`/imports` answers "did the latest export get in, and what did it find?". The
batch page is a four-step wizard: **Upload → Reality check → Load →
Normalise & link**. Each step is one button; the heavy ones run as a
background job (`docs/jobs.md`).

## 1. Upload

`POST /api/imports/upload` takes the files as the systems export them
(multipart, at most 50 files, 100 MB each, 300 MB per batch; CSV, TSV, TXT,
XLSX, XLSM, XLS, JSON, JSONL, NDJSON, PDF, DOCX). Names are reduced to a
safe basename; the files land in `data/uploads/<batch>/` (`UPLOADS_DIR`
to move it; git-ignored) and one `import_batches` row is written
(`uploaded`). Server actions cap bodies at 1 MB, hence a route handler.

"Import the demo folder" makes a batch for `data/out` (or `DATA_DIR`)
without copying; `createFolderBatchAction` accepts only folders inside the
exports or uploads folder.

## 2. Reality check

`checkBatchAction` runs `runRealityCheck(dir)` (`docs/reality-check.md`)
inline and stores the report, the verdict and the **mapping** on the batch
(`checked`). The page shows the verdict and its reasons, the datasets with
rows and period, how many fields each file mapped and what is missing, the
scorecard and the asks; the memo downloads from
`/imports/[batchId]/memo`.

The mapping (`src/import/mapping.ts`, `import-mapping-v1`) is one entry per
file: dataset, `fields` (catalogue field → the file's column(s)), and
whether dates read month-first. `mappingFromReport()` takes every column
the check matched (exact, synonym or fuzzy) and skips files the check
marked low-confidence. `REQUIRED_FOR_LOAD` names what a dataset cannot be
loaded without (work orders: id, created_at, description; surveys:
submitted_at or departure_date; stays: stay_key and arrival; …); a file
missing one is listed and skipped, never half-loaded.

## 3. Load

`loadBatchAction` starts an `import` job (`loading`). The worker runs
`loadBatch()` in `src/import/loader.ts`, which reads the folder again with
`readExportFolder`, projects each file through its mapping and inserts, in
this order:

- **rooms, facilities, equipment** → `locations`, created only when the
  code is new, with the same alias builders the seed uses
  (`src/db/scripts/lib/locations.ts`); villas sit under their building,
  hotel rooms under a floor; `serves` text becomes `location_links`.
- **stays** → `pii.stay_keys` (the key, never a name) and one `pms` signal
  per stay whose `external_id` is the stay's pseudonym (`stayRef`); the
  reservation number and the nationality never reach `raw` or `mapped`.
  Columns the reality check flagged as a person's identity are dropped
  from `raw` for every dataset (`FileMapping.drop`), and a technician's
  name becomes a keyed pseudonym (`staffRef`).
- **work orders, complaints, compensation, surveys, reviews** → `signals`,
  through `insertSignalsScrubbed()` (`src/import/signals.ts`, shared with
  the synthetic loader): PII scrub of the raw record, then an upsert on
  (property, source, external id). A new record is inserted
  (`signal.created`); a known record keeps its first observation (`raw`,
  text, time are immutable) but takes the new canonical `mapped` record
  when it changed (`signal.updated`, `normalized_at` reset so the
  normaliser revisits it) — so a ticket exported open on Monday and closed
  on Wednesday closes here too; an unchanged record is left alone. The
  external id is the file's id column or a hash of the row.
- **occupancy** → `occupancy_daily`.

Every signal gets `mapped`: the canonical record keyed by catalogue field
(`created_at`, `closed_at`, `status`, `location`, `category`, `description`,
`closure_note`, `assigned_to`, `reopened` for a ticket; `occurred_at`,
`room`, `category`, `description`, `resolution`, `agent_note` for the desk;
and so on), dates as ISO in UTC after `classifyDate` and the property's
timezone. The normaliser and the linker read `mapped` first and fall back
to the legacy raw keys, so a client's column names never reach the
pipelines. The batch id goes to `signals.ingest_batch_id`; the counts
(rows, inserted, skipped, located per source; places created; links) land
on the batch (`loaded`) and an `ingest.completed` event is written.

## 4. Normalise & link

The same job continues with `normalizeSignals` and `linkSignals` for the
property (the model when the switch was on and a key exists). The batch
page then says how many issues exist and how many pairs wait in `/review`,
with buttons to Today and Review. Loading the same export again inserts
nothing and changes nothing; loading a later export updates what changed.

Permissions: `imports.run` and `jobs.run` (group admin and GM). A batch
whose check said **stop** can be loaded only by a group admin; **reshape**
loads with the asks left open.

Tests: `src/db/__tests__/import.test.ts` derives the mapping from the
demo folder and checks every required field is mapped, loads the folder
into a second property and compares with the synthetic loader (signals per
source, locations per kind, serves links, stays, occupancy; a `mapped`
record with no identity column), loads it again for zero inserts, then
normalises and links it.
