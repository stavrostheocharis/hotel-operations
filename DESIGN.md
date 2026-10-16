# Design system

All UI for this product (manager console, staff app, guest QR chat, reports) follows this file.
It adapts the Airbnb design language (ink-first text, grey ladder, soft 20px shapes, rationed
shadows, one rare accent) to a data-dense operations app, built with **shadcn/ui** on Tailwind v4.

The one deliberate change: Airbnb's coral (#FF385C / #DA1249) is replaced by **deep Aegean blue**
(#1D4E89). In an exceptions manager the status colors must be readable at a glance, so the brand
color must not resemble any of them. Red was ruled out because it means "critical / overdue".
Teal was ruled out because it sits too close to the success green, the "verified fixed" signal
the whole product exists to prove. Blue only competes with the info status, which therefore
moves to violet. Blue also carries the Greek identity (flag, island domes) and reads as premium.

## Principles

- **Ink does the work.** `ink` #222222 for almost all text; grey ladder for meta and disabled.
- **Blue is punctuation.** One primary action per view, active nav, focus of attention. Never large fills, body text or section backgrounds.
- **Status colors carry meaning, not decoration.** Critical / warning / success / info are only used for issue state.
- **Data replaces photos.** Where Airbnb uses image carousels, we use queues, timelines and tables. Tables may use `hairline` row dividers (Airbnb avoids rules, but tables need them).
- **Soft geometry.** Nothing has a sharp corner. 20px cards, pill buttons, circular icon buttons.
- **Shadows only on floating things.** Popovers, menus, sheets, the command/search bar. Cards stay flat.

## Color tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `canvas` | #FFFFFF | #161616 | Page |
| `card` | #FFFFFF | #232323 | Cards, panels, dialogs, popovers (lighter than `surface-footer` in dark mode so cards read on muted panels) |
| `ink` | #222222 | #F2F2F2 | Primary text, headings, labels |
| `body-muted` | #6C6C6C | #A3A3A3 | Meta lines, inactive tabs, placeholders |
| `muted-soft` | #8C8C8C | #8C8C8C | Tertiary counts, timestamps |
| `text-disabled` | #C1C1C1 | #5C5C5C | Disabled controls |
| `hairline` | #DDDDDD | #333333 | Borders, inputs, table dividers |
| `surface-soft` | #F2F2F2 | #262626 | Icon buttons, chips, secondary buttons |
| `surface-hover` | #EBEBEB | #2E2E2E | Hover on `surface-soft` controls |
| `surface-footer` | #F7F7F7 | #1F1F1F | Sidebar, muted panels, hover on transparent buttons |
| `primary` (Aegean blue) | #1D4E89 | #7FB0EC | Primary action, active nav, links |
| `primary-active` | #163D6B | #A7C9F2 | Pressed / hover of primary |
| `primary-soft` | #EEF4FB | #10284A | Selected row, active chip background |
| `on-primary` | #FFFFFF | #0B2545 | Text on `primary` |
| `focus-ring` | #222222 | #F2F2F2 | Outer focus ring |

`primary` on white is 8.4:1 contrast (passes WCAG AAA for normal text).

### Status colors (new, ops-specific)

| Status | Text | Background | Border | Issue states |
|---|---|---|---|---|
| `critical` | #B42318 | #FEF3F2 | #FECDCA | Reopened, overdue against its time limit, safety |
| `warning` | #B54708 | #FFFAEB | #FEDF89 | Resolved but awaiting verification, cluster suspected |
| `success` | #067647 | #ECFDF3 | #ABEFC6 | Verified fixed |
| `info` (violet) | #5925DC | #F4F3FF | #D9D6FE | Assigned, in progress |
| neutral | `ink` | `surface-soft` | `hairline` | Detected, new |

Status always pairs color with a text label (and an icon where space allows). Never color alone.
`info` is violet rather than blue so it is never mistaken for a brand element.

## Typography

Airbnb Cereal is proprietary. Use **DM Sans** (variable, Google Fonts / `next/font`), fallback
`-apple-system, system-ui, Roboto, "Helvetica Neue", sans-serif`. Greek glyphs: DM Sans covers
Latin only, so set `"Noto Sans"` before the system fallback for Greek staff UI text.

| Token | Size / line height | Weight | Tracking | Use |
|---|---|---|---|---|
| `display` | 26 / 1.15 | 500 | normal | Page title |
| `title-lg` | 22 / 1.2 | 500 | -0.44px | Section heading |
| `title-md` | 20 / 1.2 | 600 | -0.18px | Card / panel heading |
| `title-sm` | 16 / 1.25 | 500 | normal | Row title, dialog title |
| `body-lg` | 16 / 1.5 | 400 | normal | Long text (SOP answers, guest messages) |
| `body` | 14 / 1.45 | 400 | normal | Default UI text |
| `body-strong` | 14 / 1.45 | 500 | normal | Labels, buttons, table headers |
| `caption-lg` | 13 / 1.25 | 400 | normal | Secondary row text |
| `caption` | 12 / 1.35 | 400 | normal | Meta: time, room, source |
| `caption-strong` | 12 / 1.35 | 700 | normal | Counts, KPI deltas |
| `micro` | 11 / 1.2 | 600 | normal | Badges |

Nothing above 26px, except KPI numbers on dashboards (max 32px / 500). Hierarchy comes from weight and ink-vs-grey, not size.

## Shape

| Element | Radius |
|---|---|
| Cards, panels, sheets, dialogs | 20px (`rounded-card`) |
| Primary / secondary buttons | pill (`rounded-full`), 48px large, 40px default |
| Icon buttons | circle, 40px, `surface-soft` fill |
| Inputs, selects, textareas | 12px (`rounded-lg`) |
| Chips, tabs, menu items | 8px (`rounded-sm`) or pill for filter chips |
| Footer/legal-style text links | 4px focus fill |

## Elevation

| Level | Value | Use |
|---|---|---|
| Flat | none | Cards, tables, page |
| `shadow-compact` | `0 1px 2px rgb(0 0 0/.08), 0 4px 12px rgb(0 0 0/.05)` + 1px `hairline` | Sticky headers, condensed toolbars |
| `shadow-float` | `0 0 0 1px rgb(0 0 0/.02), 0 2px 6px rgb(0 0 0/.04), 0 4px 8px rgb(0 0 0/.1)` | Popovers, dropdowns, toasts |
| `shadow-search` | `0 0 0 1px rgb(0 0 0/.02), 0 8px 24px rgb(0 0 0/.1)` + 1px `hairline` | Command bar, global search pill |
| `shadow-focus` | `0 0 0 2px #FFFFFF, 0 0 0 4px #222222` | Keyboard focus on every interactive element |

Nothing darker than 0.12 alpha. No blur, no gradients.

In dark mode these shadows vanish on #161616, so floating surfaces (popover, dropdown, dialog,
sheet, floating sidebar) add a 1px `hairline` ring there only (`dark:ring-1 dark:ring-border`);
light mode stays shadow-only. Dialog and sheet scrims are plain black at 40% opacity, no blur.

## shadcn/ui

### Setup

```bash
pnpm dlx shadcn@latest init
```

```bash
pnpm dlx shadcn@latest mcp init --client claude
```

The second command writes `.mcp.json` with the shadcn MCP server (`npx shadcn@latest mcp`). Restart
Claude Code and check `/mcp` shows it connected. Then add components through it ("add button,
dialog, card, table, sheet, command"). Private registries go under `"registries"` in `components.json`.

### Rules when using shadcn components

- shadcn's `--accent` is the **hover fill**, not the brand. It maps to `surface-soft`. The brand is `--primary`.
- Restyle variants once in `components/ui/*` instead of per page:
  - `Button` default → `rounded-full bg-primary text-primary-foreground hover:bg-primary-active`
  - `Button` secondary → `rounded-full bg-secondary hover:bg-surface-hover`
  - `Button` ghost → `rounded-full hover:bg-muted`
  - `Card` → `rounded-card border-0 shadow-none` (flat; separate by space and tone)
  - `Badge` → add `critical | warning | success | info` variants from the status table
  - All focus states → `focus-visible:shadow-focus focus-visible:outline-none` (replace default `ring`)
- Popover, DropdownMenu, Tooltip, Toast → `shadow-float`. Command / search → `shadow-search`.
- Tables: `hairline` row borders, `body` text, `body-strong` headers in `body-muted`.

### Theme (paste into `app/globals.css` after `shadcn init`, replacing its `:root` and `.dark`)

Keep the `@theme inline` color mapping that `shadcn init` generates (`--color-background:
var(--background)` and friends); the block below replaces values and adds tokens, it does not
replace that mapping. Set shadcn's radius ladder to the Shape table (`rounded-xs` 4px, `-sm` 8px,
`-md` 10px, `-lg` 12px, `-2xl`/`-card` 20px). The implemented reference lives in
`app/src/app/globals.css` and `app/src/components/ui/`; `app/DESIGN-NOTES.md` records deviations.

```css
:root {
  --radius: 0.75rem;

  --background: #FFFFFF;
  --foreground: #222222;
  --card: #FFFFFF;
  --card-foreground: #222222;
  --popover: #FFFFFF;
  --popover-foreground: #222222;
  --primary: #1D4E89;
  --primary-foreground: #FFFFFF;
  --primary-active: #163D6B;
  --primary-soft: #EEF4FB;
  --secondary: #F2F2F2;
  --secondary-foreground: #222222;
  --muted: #F7F7F7;
  --muted-foreground: #6C6C6C;
  --accent: #F2F2F2;
  --accent-foreground: #222222;
  --surface-hover: #EBEBEB;
  --destructive: #B42318;
  --border: #DDDDDD;
  --input: #DDDDDD;
  --ring: #222222;
  --muted-soft: #8C8C8C;
  --text-disabled: #C1C1C1;

  --critical: #B42318;  --critical-bg: #FEF3F2;  --critical-border: #FECDCA;
  --warning: #B54708;   --warning-bg: #FFFAEB;   --warning-border: #FEDF89;
  --success: #067647;   --success-bg: #ECFDF3;   --success-border: #ABEFC6;
  --info: #5925DC;      --info-bg: #F4F3FF;      --info-border: #D9D6FE;

  --chart-1: #1D4E89;
  --chart-2: #4F86C6;
  --chart-3: #9DBFE5;
  --chart-4: #8C8C8C;
  --chart-5: #C1C1C1;

  --sidebar: #F7F7F7;
  --sidebar-foreground: #222222;
  --sidebar-primary: #1D4E89;
  --sidebar-primary-foreground: #FFFFFF;
  --sidebar-accent: #EBEBEB;
  --sidebar-accent-foreground: #222222;
  --sidebar-border: #DDDDDD;
  --sidebar-ring: #222222;
}

.dark {
  --background: #161616;
  --foreground: #F2F2F2;
  --card: #232323;
  --card-foreground: #F2F2F2;
  --popover: #232323;
  --popover-foreground: #F2F2F2;
  --primary: #7FB0EC;
  --primary-foreground: #0B2545;
  --primary-active: #A7C9F2;
  --primary-soft: #10284A;
  --secondary: #262626;
  --secondary-foreground: #F2F2F2;
  --muted: #1F1F1F;
  --muted-foreground: #A3A3A3;
  --accent: #262626;
  --accent-foreground: #F2F2F2;
  --surface-hover: #2E2E2E;
  --destructive: #F97066;
  --border: #333333;
  --input: #333333;
  --ring: #F2F2F2;
  --muted-soft: #8C8C8C;
  --text-disabled: #5C5C5C;

  --critical: #F97066;  --critical-bg: #55160C;  --critical-border: #912018;
  --warning: #FDB022;   --warning-bg: #4E1D09;   --warning-border: #93370D;
  --success: #47CD89;   --success-bg: #053321;   --success-border: #085D3A;
  --info: #9B8AFB;      --info-bg: #27115F;      --info-border: #4A1FB8;

  --chart-1: #7FB0EC;
  --chart-2: #4F86C6;
  --chart-3: #2F5F9E;
  --chart-4: #A3A3A3;
  --chart-5: #5C5C5C;

  --sidebar: #1F1F1F;
  --sidebar-foreground: #F2F2F2;
  --sidebar-primary: #7FB0EC;
  --sidebar-primary-foreground: #0B2545;
  --sidebar-accent: #2E2E2E;
  --sidebar-accent-foreground: #F2F2F2;
  --sidebar-border: #333333;
  --sidebar-ring: #F2F2F2;
}

@theme inline {
  --font-sans: "DM Sans", "Noto Sans", -apple-system, system-ui, Roboto, "Helvetica Neue", sans-serif;

  --color-primary-active: var(--primary-active);
  --color-primary-soft: var(--primary-soft);
  --color-surface-hover: var(--surface-hover);
  --color-muted-soft: var(--muted-soft);
  --color-text-disabled: var(--text-disabled);
  --color-critical: var(--critical);  --color-critical-bg: var(--critical-bg);  --color-critical-border: var(--critical-border);
  --color-warning: var(--warning);    --color-warning-bg: var(--warning-bg);    --color-warning-border: var(--warning-border);
  --color-success: var(--success);    --color-success-bg: var(--success-bg);    --color-success-border: var(--success-border);
  --color-info: var(--info);          --color-info-bg: var(--info-bg);          --color-info-border: var(--info-border);

  --radius-card: 20px;

  --shadow-compact: 0 1px 2px rgb(0 0 0 / 0.08), 0 4px 12px rgb(0 0 0 / 0.05);
  --shadow-float: 0 0 0 1px rgb(0 0 0 / 0.02), 0 2px 6px rgb(0 0 0 / 0.04), 0 4px 8px rgb(0 0 0 / 0.1);
  --shadow-search: 0 0 0 1px rgb(0 0 0 / 0.02), 0 8px 24px rgb(0 0 0 / 0.1);
  --shadow-focus: 0 0 0 2px var(--background), 0 0 0 4px var(--ring);

  --text-display: 1.625rem;   --text-display--line-height: 1.15;   --text-display--font-weight: 500;
  --text-title-lg: 1.375rem;  --text-title-lg--line-height: 1.2;   --text-title-lg--font-weight: 500;  --text-title-lg--letter-spacing: -0.44px;
  --text-title-md: 1.25rem;   --text-title-md--line-height: 1.2;   --text-title-md--font-weight: 600;  --text-title-md--letter-spacing: -0.18px;
  --text-title-sm: 1rem;      --text-title-sm--line-height: 1.25;  --text-title-sm--font-weight: 500;
  --text-body-lg: 1rem;       --text-body-lg--line-height: 1.5;
  --text-body: 0.875rem;      --text-body--line-height: 1.45;
  --text-body-strong: 0.875rem; --text-body-strong--line-height: 1.45; --text-body-strong--font-weight: 500;
  --text-caption-lg: 0.8125rem; --text-caption-lg--line-height: 1.25;
  --text-caption: 0.75rem;    --text-caption--line-height: 1.35;
  --text-caption-strong: 0.75rem; --text-caption-strong--line-height: 1.35; --text-caption-strong--font-weight: 700;
  --text-micro: 0.6875rem;    --text-micro--line-height: 1.2;      --text-micro--font-weight: 600;
}
```

## Do / Don't

**Do**
- One blue primary action per view; everything else secondary or ghost.
- Blue marks navigation (sidebar active item on `primary-soft`). Tabs are in-page segmentation, so their active underline is ink, not blue.
- Badge `default` is the neutral "detected / new" chip; the blue brand chip is opt-in (`variant="primary"`).
- Pair `ink` titles with `body-muted` meta in every row (title 14–16/500, meta 12/400).
- 48px touch targets in the staff app and guest chat; 40px minimum in the console.
- Show the double focus ring on every interactive element.

**Don't**
- Don't use coral, pink or red for brand. Red is `critical` only.
- Don't use green or teal for brand. Green is `success` only.
- Don't use the `sm` / `xs` button sizes in console, staff or guest views; they exist only for dense shadcn internals.
- Don't shadow or outline cards.
- Don't add a second typeface or headings above 26px.
- Don't use pure black (#000000) for text.
- Don't use status colors in categorical charts; use the `chart-*` ramp.
