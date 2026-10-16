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

- http://localhost:3000 — placeholder home page
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
pnpm db:test               # fresh test database, migrations, seed, load, vitest
pnpm db:generate           # after editing src/db/schema/*.ts
pnpm db:studio             # drizzle-kit studio
```

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
    page.tsx          placeholder home
    design/           /design reference route
  components/
    ui/               shadcn components, restyled
    theme-provider.tsx
    theme-toggle.tsx
  db/
    index.ts          createDb(), withTenant(), getAppDb(), getAdminDb()
    schema/           Drizzle tables and enums (one file per area)
    scripts/          migrate, seed, load-synthetic (+ lib/ readers and helpers)
    __tests__/        vitest suite against a real Postgres
  hooks/use-mobile.ts
  lib/utils.ts        cn()
```
