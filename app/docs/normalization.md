# Normalisation

Turns the raw rows in `signals` into something the linking engine can work
with: a language, an English text, a location in the seeded hierarchy, a
category and topic from one clean taxonomy. Only the derived columns of
`signals` are written (`language`, `language_confidence`, `text_en`,
`location_*`, `category`, `topic`, `normalized`, `normalized_at`); the
observation itself stays immutable (see [data-model.md](data-model.md)).

```bash
pnpm db:normalize --eval            # rules only, then score against data/out/answer_key.json
pnpm db:normalize --llm             # rules, then OpenAI for what the rules left open
pnpm db:normalize --all --limit=40  # re-process the first 40 signals (handy with --llm)
pnpm db:normalize --fake-llm        # exercise the LLM code path without a network call
```

## Principle: rules first, model second, everything explainable

Every stage runs deterministic rules first and records *which* rule fired in
`signals.normalized` (`language_method`, `location_rule`, `classification`).
Only what the rules cannot settle is handed to the model, and every model
output is stored in `ai_suggestions` with the model id and prompt version, so
a result can always be traced to a rule or to a specific call.

## Stages

| # | Stage | How | Writes |
|---|---|---|---|
| 0 | PII scrub | At ingest (`db:load-synthetic`), before anything is stored: emails, phone numbers, IBANs and card numbers in the text and in every string of the raw row become `[email]`, `[phone]`, `[iban]`, `[card]`. Conservative by design: room numbers, timestamps, ticket and reservation numbers are never touched. | `text_original`, `raw`, `normalized.pii_redactions` |
| 1 | Language | Script detection for Greek, Cyrillic and Hebrew; a Greeklish lexicon and ending heuristic for Greek written in Latin letters (`el-latn`); `franc` trigram statistics for English, German, French and Italian; cue-word voting for short texts; English as the default for short staff notes. | `language`, `language_confidence` |
| 2 | Place | Where the record was typed or where the guest stayed. Typed fields (work-order `Location`, front-desk `Room`) go through exact and alias matching, then regex rules in order: equipment (`Bldg C boiler room`, `Λεβητοστάσιο C`, `lobby lift`), villa, room number, facility keyword, floor, building. Free text is tried too and the most specific hit wins. Surveys and reviews only accept explicit rooms, villas or equipment from the text; otherwise a survey takes the room of its stay (`stay_ref` → PMS signal) and a review stays unlocated, with any wing mention kept as `normalized.building_hint`. | — (held until stage 4) |
| 3 | Category and topic | Multilingual keyword rules per topic (56 topics, 18 categories, seven languages plus Greeklish); the export drop-downs (`Category`, `Dept`) only break ties or stand in when the text says nothing. Guest text is scored sentence by sentence and sentences that only praise are skipped, so "breakfast was superb" is not a breakfast complaint. Preventive-maintenance tickets outrank the fault they mention. | `category`, `topic`, `normalized.classification` |
| 4 | Location | The place, moved by the topic's scope: a breakfast complaint typed against room 312 is located at the restaurant; a lift complaint from a room at that building's lift; everything else at the place. The original place is kept in `normalized.place`. | `location_id`, `location_method`, `location_confidence`, `normalized.location_rule` |
| 5 | LLM (optional) | Translation of every non-English text; classification of texts the rules could not place; location of work orders and front-desk rows that are still unlocated, from a catalogue of buildings, floors, facilities and equipment. | `text_en`, `category`, `topic`, `location_*`, rows in `ai_suggestions` |

Every processed signal gets a `signal.normalized` event. A second run is a
no-op unless `--all` is passed.

## Scores on the synthetic season (seed 42, rules only)

`pnpm db:normalize --eval` compares against `data/out/answer_key.json`.
Location accuracy is against the key's `true_location` (the room, facility or
equipment where the symptom was observed); precision is accuracy over the
rows where a location was predicted at all.

| source | n | language | location acc / coverage / precision | category | topic |
|---|---|---|---|---|---|
| work orders | 1,148 | 97.2 % | 96.5 % / 98.6 % / 97.9 % | 90.6 % | 85.5 % |
| front desk | 483 | 98.3 % | 97.5 % / 100 % / 97.5 % | 86.1 % | 84.5 % |
| surveys | 2,598 | 96.7 % | 98.3 % / 100 % / 98.3 % | 96.8 % | 96.8 % |
| reviews | 653 | 99.5 % | 5.2 % / 8.6 % / 60.7 % | 90.8 % | 90.5 % |
| all | 4,882 | 97.6 % | 85.4 % / 87.4 % / 97.6 % | 93.5 % | 92.1 % |

Reading the review row: guests almost never name their room in a public
review, so a guess would be worse than a gap. The pipeline locates a review
only when it names a room, a villa, a piece of equipment or a facility-scoped
complaint, and keeps the wing as a hint for the linking engine.

The test suite (`pnpm db:test`) asserts floors below these numbers so a rule
change that regresses a source fails the build. The remaining misses are what
the LLM stage is for: the synthetic texts are template variants, so the
keyword rules look better here than they will on real exports; expect the
model share to be higher on real data.

## The LLM stage

Provider: OpenAI, through the Vercel AI SDK (`ai` + `@ai-sdk/openai`), with
structured output validated by zod. Configuration in `.env`:

```
OPENAI_API_KEY=...
OPENAI_MODEL_FAST=gpt-5.4-mini        # translation, classification, location
OPENAI_MODEL_REASONING=gpt-5.5        # reserved for linking judgments (step 6)
OPENAI_EMBEDDING_MODEL=text-embedding-3-large   # 1024-dim, for signal_embeddings (step 6)
```

Calls are batched (20 records per call, four in flight) with `reasoningEffort:
"low"`. The code is behind an `LlmClient` interface (`src/normalize/llm.ts`)
with a deterministic fake for tests, so no test touches the network, and the
provider can be swapped (for an EU-hosted endpoint, for instance) without
touching the pipeline.

What is recorded per call: `ai_suggestions.kind` (`translate`, `classify`,
`locate`), `input_refs.signal_id`, `output`, `model`, `prompt_version`,
`confidence`, and `decision`. Derived fields are applied automatically with
`decision = accepted, decided_by = system`; a `locate` answer that names a code
outside the catalogue is stored as `rejected` and not applied. A reviewer can
later flip a decision and the derived columns are re-derived from the rules.

A live run over the first 40 signals of the synthetic season
(`--all --llm --limit=40`) made 5 translation and 4 classification calls and
produced, for example, `Στρώμα βουλιαγμένο 288` → `Sagging mattress 288`.

## What this step does not do

- No linking between signals: that is step 6 (`issue_signals`, embeddings,
  the "same issue / related / unrelated" judgment).
- No room resolution for reviews beyond explicit mentions.
- No learning: rules are hand-written. The accept/reject decisions in
  `ai_suggestions` and the answer key are the training signal for later.

## Files

```
src/normalize/
  language.ts        detectLanguage()
  pii.ts             scrubPii(), scrubValue()
  regex.ts           Unicode-aware \b and \w (JavaScript's are ASCII-only), Hebrew prefixes
  location-rules.ts  LocationIndex, inferLocation()
  taxonomy.ts        CATEGORIES, TOPICS with keyword rules, classifyText()
  llm.ts             LlmClient, createOpenAiLlm(), createFakeLlm()
  pipeline.ts        normalizeSignals(), resetNormalization()
  eval.ts            evaluateNormalization(), formatReport()
  __tests__/         unit tests per stage (no database)
src/db/scripts/normalize.ts   the CLI
src/db/__tests__/normalize.test.ts   integration test with score floors
```

## Fields set by hand

A supervisor can set a record's place or its category and topic from the
console. Those fields are listed in `signals.locked_fields` and the
pipeline leaves them alone on later runs (`src/normalize/pipeline.ts`,
write-back): everything else about the record is still recomputed.
