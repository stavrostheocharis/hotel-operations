# DESIGN-NOTES

Where the implementation cannot follow DESIGN.md literally, and what was done
instead. DESIGN.md itself is the source of truth and is not edited from here;
earlier items in this file were folded into it on 2026-10-16.

## 1. Fonts: the theme block is verbatim, but mind the next/font variables

`src/app/layout.tsx` loads DM Sans (latin, latin-ext) and Noto Sans (greek,
greek-ext) with `next/font/google`. Next 16 registers the self-hosted faces
under their real family names, so the `--font-sans` line from DESIGN.md works
as written: Latin glyphs come from DM Sans, Greek glyphs fall through to Noto
Sans because the DM Sans faces are limited to Latin unicode ranges.

Do **not** switch `--font-sans` to `var(--font-dm-sans), var(--font-noto-sans)`.
Each next/font variable expands to `"DM Sans", "DM Sans Fallback"`, where the
fallback is a metric-matched local Arial covering every code point, so Greek
text would render in Arial before it ever reaches Noto Sans (Next 16 emits that
fallback face even with `adjustFontFallback: false`). The /design type ladder
shows a Greek sample on every row for a quick visual check.

## 2. shadcn now ships Base UI, not Radix

`shadcn@4` initialises the `base-nova` style on `@base-ui/react`. Visible
differences: triggers compose with `render={<Button />}` instead of `asChild`,
state selectors are `data-open` / `data-active` rather than `data-[state=…]`,
and menu labels must sit inside a `DropdownMenuGroup` (a bare
`DropdownMenuLabel` throws when the menu opens). The DESIGN.md "Rules when
using shadcn components" apply unchanged; the restyled files in
`src/components/ui/` are the reference.

## 3. Focus ring on non-canvas surfaces

`--shadow-focus` uses `var(--background)` for the inner 2px gap, as DESIGN.md
defines it. On the sidebar (#F7F7F7) or inside a selected row the inner ring is
therefore white rather than the surface colour. Acceptable, but worth knowing.
