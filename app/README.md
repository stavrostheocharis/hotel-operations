# Operations Exception Manager · web app

The Next.js app for the AI Operations Exception Manager: manager console, staff
app and guest QR chat all live here. Stack: **Next.js 16** (App Router,
TypeScript), **Tailwind CSS v4**, **shadcn/ui** (`base-nova` style on Base UI),
**pnpm**.

## Run it

Requires Node 22+ and pnpm 10 (`corepack enable pnpm` if you do not have it).

```bash
pnpm install
pnpm dev
```

- http://localhost:3000 — the exceptions queue (needs a seeded, loaded, normalised
  and linked database: the `db:*` commands below, in that order)
- http://localhost:3000/issues/[id] — one issue: evidence, tickets, outcomes,
  confirm / reject on every link ([docs/console.md](docs/console.md))
- http://localhost:3000/audit — the season audit: baseline, recurring failures,
  fixes that did not hold, winter-works list, records assessment; print it for
  the PDF, export Markdown / CSV / JSON ([docs/audit.md](docs/audit.md))
- http://localhost:3000/design — live design-system reference (every token and
  component, light/dark toggle in the header)

Checks:

```bash
pnpm build
pnpm lint
pnpm exec tsc --noEmit
```

## Database

Postgres 16 with pgvector in Docker, Drizzle ORM, row-level security per
property. Full description in [`docs/data-model.md`](docs/data-model.md).

```bash
cp .env.example .env
pnpm db:up                 # start Postgres (docker compose, waits for healthy)
pnpm db:migrate            # apply drizzle/ migrations
pnpm db:seed               # demo group + property + location hierarchy from ../data
pnpm db:load-synthetic     # raw exports from ../data/out into signals
pnpm db:normalize --eval   # rules-only normalisation of signals, scored against the answer key
pnpm db:normalize --llm    # same, plus OpenAI for translation and leftovers (needs OPENAI_API_KEY)
pnpm db:link --eval        # link signals into issues (rules only), scored against the answer key
pnpm db:embed              # OpenAI embeddings for every signal text (needs OPENAI_API_KEY)
pnpm db:link --embed --llm # linking with embeddings and the reasoning model on the gray zone
pnpm db:audit --fake-llm   # season audit → data/reports/audit/{audit.md, winter-works.csv, audit.json}
pnpm db:test               # fresh test database, migrations, seed, load, normalise, vitest
pnpm test:unit             # the pure tests only (reality check), no database
pnpm db:generate           # after editing src/db/schema/*.ts
pnpm db:studio             # drizzle-kit studio
```

Before any of that, the phase-0 **data reality check** reads a client's export folder as
delivered (CSV / XLSX / JSON, any delimiter, encoding or column names) and writes the
go / reshape / stop memo of `docs/discovery/05-go-no-go.md`, without a database:

```bash
pnpm db:reality-check --dir=../data/out                  # → data/out/reality-check/reality-check.md
pnpm db:reality-check --dir=/path/to/export --out=/path/to/memo
```

See [`docs/reality-check.md`](docs/reality-check.md).

Normalisation (language, location, category/topic, PII, translation) is described in
[`docs/normalization.md`](docs/normalization.md); linking signals into issues with recurrence
and root cause in [`docs/linking.md`](docs/linking.md). The LLM provider is OpenAI through the
Vercel AI SDK; models are set in `.env` (`OPENAI_MODEL_FAST`, `OPENAI_MODEL_REASONING`,
`OPENAI_EMBEDDING_MODEL`).

The synthetic exports are produced by `../data` (`cd ../data && uv sync && uv
run python -m generator --seed 42 --out out/`).

## Where the theme lives

| What | Where |
|---|---|
| Source of truth for all UI | [`../DESIGN.md`](../DESIGN.md). Change it there first. |
| Theme variables (`:root`, `.dark`, `@theme inline`) | [`src/app/globals.css`](src/app/globals.css). The DESIGN.md theme block is copied verbatim; below it sits the shadcn colour mapping and radius ladder that DESIGN.md says to keep. |
| Fonts (DM Sans + Noto Sans for Greek) → `--font-sans` | [`src/app/layout.tsx`](src/app/layout.tsx) via `next/font` |
| Light/dark switching | `next-themes` with the `class` strategy; provider in `layout.tsx`, toggle in [`src/components/theme-toggle.tsx`](src/components/theme-toggle.tsx) |
| Restyled shadcn components | [`src/components/ui/`](src/components/ui/). Restyle **once here**, never per page. |
| Reference route | [`src/app/design/`](src/app/design/) (`tokens.ts` is the token inventory the page renders) |
| Remaining deviations (fonts, Base UI, focus ring) | [`DESIGN-NOTES.md`](DESIGN-NOTES.md) |
| shadcn MCP server for Claude Code | [`.mcp.json`](.mcp.json) |

## Token cheat sheet

DESIGN.md name → Tailwind utility.

| DESIGN.md | Utility |
|---|---|
| canvas / card / ink | `bg-background` / `bg-card` / `text-foreground` |
| body-muted · muted-soft · text-disabled | `text-muted-foreground` · `text-muted-soft` · `text-text-disabled` |
| hairline | `border-border`, `divide-border` |
| surface-soft · surface-hover · surface-footer | `bg-secondary` (or `bg-accent`) · `bg-surface-hover` · `bg-muted` |
| primary · primary-active · primary-soft · on-primary | `bg-primary` · `bg-primary-active` · `bg-primary-soft` · `text-primary-foreground` |
| status text / bg / border | `text-critical` `bg-critical-bg` `border-critical-border` (same for `warning`, `success`, `info`) |
| type ladder | `text-display` `text-title-lg` `text-title-md` `text-title-sm` `text-body-lg` `text-body` `text-body-strong` `text-caption-lg` `text-caption` `text-caption-strong` `text-micro` |
| radii | `rounded-full` (pills), `rounded-card` (20px), `rounded-lg` (12px inputs), `rounded-sm` (8px chips/tabs/menu items), `rounded-xs` (4px link focus) |
| elevation | `shadow-compact` `shadow-float` `shadow-search` `shadow-focus` |

## Adding components

Use the shadcn CLI or the shadcn MCP server (`.mcp.json`, shows up in Claude
Code's `/mcp`):

```bash
pnpm dlx shadcn@latest add <component>
```

Then apply the DESIGN.md rules in the generated file before using it:

- `import { cn } from "cn"` → `import { cn } from "@/lib/utils"` (lint enforces this;
  the stock engine does not know the DESIGN.md type sizes and drops `text-body`
  when a text colour follows)
- `focus-visible:ring-*` → `focus-visible:shadow-focus focus-visible:outline-none`
- `ring-1 ring-foreground/10`, `shadow-sm`, `shadow-md` on panels → remove;
  floating surfaces get `shadow-float` (menus, popovers, sheets, tooltips) or
  `shadow-search` (command / search), plus `dark:ring-1 dark:ring-border`
- `rounded-xl` panels → `rounded-card`; `rounded-md` items → `rounded-sm`
- `text-sm` / `text-xs` → `text-body` / `text-caption`; `font-medium` labels → `text-body-strong`
- `opacity-50` disabled states → `text-text-disabled` (and `bg-secondary` for fills)
- buttons: `rounded-full`, default 40px, large 48px
- Base UI components compose with `render={<Button />}` rather than `asChild`

## Layout of `src/`

```
src/
  app/
    layout.tsx        fonts, ThemeProvider, TooltipProvider
    globals.css       theme
    page.tsx          / exceptions queue + KPIs
    issues/[id]/      one issue: evidence, tickets, outcomes, confirm / reject
    audit/            /audit season report, export/ route for md / csv / json
    design/           /design reference route
  audit/
    types.ts          AuditReport
    report.ts         buildAuditReport(): queries + assembly under withTenant
    records.ts        records assessment: measures, thresholds, five changes
    markdown.ts       renderMarkdown(), renderWinterWorksCsv()
    narrative.ts      model-written summary (AI SDK) and a fake for tests
  components/
    ui/               shadcn components, restyled
    console/          shell (header + nav), status and source badges, print button
    theme-provider.tsx
    theme-toggle.tsx
  db/
    index.ts          createDb(), withTenant(), getAppDb(), getAdminDb()
    schema/           Drizzle tables and enums (one file per area)
    scripts/          migrate, seed, load-synthetic, normalize, reality-check (+ lib/ readers and helpers)
    __tests__/        vitest suite against a real Postgres
  console/
    tenant.ts         getCurrentTenant(): the demo property until sign-in exists
    queries.ts        read models: listIssues, countIssues, getKpis, getIssue (all under withTenant)
    decisions.ts      applyLinkDecision(): confirm / reject, pinned in link_decisions
    actions.ts        the server action behind the buttons
    format.ts         dates, durations, status → badge
  normalize/
    language.ts       franc + Greeklish detection
    pii.ts            email / phone / IBAN / card scrubbing at ingest
    location-rules.ts regex location inference over the seeded hierarchy
    taxonomy.ts       categories, topics and multilingual keyword rules
    llm.ts            LlmClient interface, OpenAI (AI SDK) and fake implementations
    pipeline.ts       the stages, writes derived columns + events + ai_suggestions
    eval.ts           scoring against data/out/answer_key.json
  reality/
    read.ts           readExportFolder(): a client's folder as delivered → tables of string cells
    catalogue.ts      the data request as a target schema; headers.ts matches columns to it
    analyze.ts        the facts, pure; scorecard.ts the go / reshape / stop rules; markdown.ts the memo
  link/
    rules.ts          candidate pairs: same place, serves, containment, clusters, leaks, stays, reviews
    cluster.ts        union-find over accepted pairs
    issues.ts         cluster → issue: root cause, closures, reopen evidence, status
    embeddings.ts     OpenAI embeddings into signal_embeddings, cosine for gray pairs
    pipeline.ts       rules → embeddings → model judge → clusters → issues/actions/outcomes/events
    eval.ts           pairwise F1, issues found per scenario, agreement with the key
  hooks/use-mobile.ts
  lib/utils.ts        cn()
```
