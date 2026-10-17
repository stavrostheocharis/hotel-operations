# Linking

Turns normalised signals into issues: which records describe the same
underlying problem, where its cause sits, whether it came back, and whether
the last fix held. This is the table the product is built around
(`issue_signals`), and the step the competitors' review-to-ticket features do
not do.

```bash
pnpm db:link --eval                       # rules only, then score against data/out/answer_key.json
pnpm db:embed                             # OpenAI embeddings for every signal text (once)
pnpm db:link --embed --llm --eval         # embeddings and the reasoning model on the gray zone
pnpm db:link --embed --llm --judge-limit=60   # cap the model at the 60 most promising gray pairs
pnpm db:link --fake-llm                   # exercise the judge code path without a network call
```

Issues are derived data; signals are the record. A run recomputes every
cluster, then **reconciles** it with what is in the table instead of wiping
it (`src/link/persist.ts`): each new cluster claims the existing issue it
shares most signals with (ties go to the issue holding the first report,
then to one a person touched), so a claimed issue keeps its id and with it
its owner, its notes and its history; its derived fields (title, place,
root cause, reopen count, `derived_status`) are updated. Existing issues
nothing claimed are deleted when untouched, or marked `superseded_at` (with
`superseded_by_issue_id`) when a person had touched them. Only derived
rows are rewritten: `issue_signals`, the tickets from the export, and the
`recurred` / `no_recurrence` outcomes. Status: the linker owns it while
`status_source = 'system'`; once a person set it (`'human'`) it stays,
except that a reopening report newer than the person's decision reopens
the issue again (`issue.status_changed` with `source: system`).
`issue.detected`, `issue.reopened` and `issue.resolved` events are written
once, not once per run.

What the rules leave between 0.4 and 0.6 after embeddings and the model is
not dropped: the best 300 pairs are written as pending `ai_suggestions` of
kind `link` for a person to answer in the console's Review queue (the
pending set is rewritten on every run; decided ones stay as history).
Records a person linked by hand (`issue_signals.decided_by` ≠ system) are
never rewritten, and an issue made only of such records is kept as it is.

Human decisions on links survive the same way through `link_decisions`
(`link` / `unlink`, written by the console), read at the start of every
run — `unlink` pairs are removed from the candidates, `link` pairs are
accepted outright with `rule = human`. See [console.md](console.md).

## Principle: the rules decide, the model only settles what they can't

Every candidate pair comes from a named rule with the numbers behind it, kept
in `issue_signals.evidence`. A pair scored at or above **0.6** links; between
**0.4 and 0.6** it is "gray" and goes to the embeddings and then the model;
below 0.4 it is dropped. Nothing links without a rule having proposed it, so a
model can only confirm or reject a plausible pairing, never invent one.

## Rules (`src/link/rules.ts`)

| rule | what it pairs | score |
|---|---|---|
| `same-place-topic` | same room, villa, equipment or facility, same topic | 0.9 within 45 days; 0.65 up to 120 days (60 for facilities); short-lived topics (a blown bulb) only within 21 days |
| `same-place-category` | same place, same category, one side has no topic | 0.6 within 14 days, 0.5 up to 30 |
| `same-place-unclassified` | same place, one side unclassified | 0.4 (gray; needs text similarity or the model) |
| `serves-topic` / `serves-category` | a piece of equipment and what `location_links` says it serves (boiler → building, heat pump → pool, steam generator → spa), same topic / same category | 0.8 / 0.6 within 14 days, 0.5 up to 30 |
| `containment` | a record at a building, floor or the building's own plant (boiler, chiller, pump, lift, lock server) and a room record in it, same topic | 0.7 within 45 days, 0.5 up to 90 |
| `building-cluster` | three or more rooms in one building with the same shared-plant or housekeeping topic within a 14-day run (gaps ≤ 7 days); building, floor and matching-equipment records in that run join as the hub | 0.8 (rooms), 0.85 (hub) |
| `cross-room-leak` | a ceiling leak and any plumbing record in the room directly above within 21 days | 0.75 |
| `same-stay` | a survey and a complaint carrying the same pseudonymous stay key and topic | 0.9 |
| `review-attach` | after clustering: a review with a topic but no location joins the one cluster of that topic in the wing it mentions (or at the topic's facility), published while the cluster was live or within 35 days after; any ambiguity means no link | 0.6 |

Preventive-maintenance tickets never link and never become issues.

### Gray zone

- **Embeddings** (`src/link/embeddings.ts`): `text-embedding-3-large` at 1024
  dimensions in `signal_embeddings`, cosine similarity on the gray pair's
  texts: ≥ 0.8 adds 0.25, ≥ 0.65 adds 0.12, < 0.35 subtracts 0.2.
- **Model judge** (`LlmClient.judgeLinks`, `OPENAI_MODEL_REASONING`): the
  remaining gray pairs, highest rule score first, in batches of ten: *same* →
  0.9, *related* → 0.6, *unrelated* → 0.2, with a one-sentence reason. Every
  verdict is written to `ai_suggestions` (`kind = link`) with the pair, the
  rule that proposed it, model and prompt version.

## From clusters to issues (`src/link/issues.ts`)

Accepted pairs are merged with union-find. A cluster becomes an issue when it
has two or more signals, or when its single signal is an actionable record
(work order, front-desk complaint, staff report, guest QR) with a topic.

- **Root cause location**: an equipment record in the cluster wins; a
  building cluster resolves to the building's plant for that topic (`C-BOILER`
  for hot water in the Sea Wing), else to the floor all rooms share, else the
  building; a single room stays the room; facility topics stay at the
  facility.
- **Closures** are the work orders' closed timestamps. **Reopen evidence** is
  a live record (front desk, work order, staff, guest QR) more than two days
  after a closure, or a survey whose stay began after it. Public reviews
  arrive weeks after the stay and are never evidence.
- **Episodes** are runs of non-review signals separated by more than seven
  days. `recurred = reopen evidence or ≥ 2 episodes`; `fix held = no evidence
  after the last closure` (null when nothing was ever closed).
- **Status**: no closure → `detected`; evidence after the last closure →
  `reopened`; otherwise `resolved`, or `closed_unverified` once the category's
  recurrence window (90 days plumbing, 60 hvac, 7 housekeeping, 14 F&B, 30
  default) has passed without evidence. An `outcome` of kind `recurred`
  (strength 0) or `no_recurrence` (strength 1) is written accordingly;
  `verified` (strength ≥ 2) needs a guest confirmation or staff evidence,
  which no export provides.
- **Duplicates**: a second ticket at the same place for the same topic within
  two days is linked with role `duplicate`.
- Each work order becomes an `action` of kind `ticket_created` with the
  export's ticket number, technician, status, closure note and closed time.
  `issue.detected`, `issue.resolved` and `issue.reopened` events are written.

## Scores on the synthetic season (seed 42, rules only)

| metric | value |
|---|---|
| pairwise precision / recall / F1 over planted signals | 97.5 % / 81.4 % / 88.7 % |
| planted issues found (majority of signals in one predicted issue) | 42 / 42, every scenario |
| decoys pulled into a planted issue | 2 of 13 (a same-week complaint at the same restaurant; a key-card complaint next door inside a building cluster) |
| agreement on found issues: recurred / fix held / root-cause location | 81 % / 81 % / 81 % |
| predicted issues | 1,098, of which 107 with two or more signals; largest 78 (breakfast complaints at one restaurant across the season) |

Where the remaining recall goes: reviews that name no place (only explicit
rooms or an unambiguous wing-and-topic match link), and signals whose topic
the keyword rules missed, which the classification stage hands to the model
in a live run. The test suite (`pnpm db:test`) asserts floors below these
numbers so a rule change that regresses a scenario fails the build.

A live run on the same data (`db:embed`, then `db:link --embed --llm
--judge-limit=60`) embedded 3,674 texts, moved 2,080 of the 5,635 gray pairs
by text similarity, and had `gpt-5.5` judge the 60 most promising of the rest
(33 unrelated, 22 related, 5 same, with reasons such as "both comments praise
the spa and infinity-pool sunset, with no fault mentioned"). F1 rose to
89.0 %. The gray zone is large because every unclassified record at a busy
place proposes a pair; with the classification stage's own model pass and
the full judge run that zone shrinks, at a cost of roughly one call per ten
pairs.

## What this step does not do

- No incremental linking: every run recomputes the property's clusters
  (and then reconciles them with the existing issues, see above).
- The review queue holds at most 300 pairs per run; the rest of the gray
  zone is neither linked nor asked about.
- No verification outcomes above strength 1: those come from the staff app
  and the guest QR channel.
- Episodes are not split into separate issues; a season-long facility
  problem is one issue with many episodes, which is what the audit wants
  but not what a duty manager wants to see at 22:00. The console will show
  episodes.

## Files

```
src/link/
  types.ts        LinkSignal, CandidatePair, which sources are live / actionable
  rules.ts        generateCandidates(), attachOrphanReviews(), windows and thresholds
  cluster.ts      clusterPairs() union-find
  issues.ts       buildIssue(): root cause, closures, reopen evidence, status
  persist.ts      reconcileIssues(): match clusters to existing issues, keep ids and human state
  embeddings.ts   embedSignals(), loadEmbeddings(), cosine()
  pipeline.ts     linkSignals(): rules → embeddings → judge → clusters → persist
  eval.ts         evaluateLinking(), formatLinkReport()
  __tests__/      rules and issue-building unit tests (no database)
src/db/scripts/link.ts, embed.ts   the CLIs
src/db/schema/decisions.ts         link_decisions: human link / unlink pins per signal pair
src/db/__tests__/link.test.ts      integration test with score floors
src/db/__tests__/console.test.ts   read models, and that pins survive a rebuild
```
