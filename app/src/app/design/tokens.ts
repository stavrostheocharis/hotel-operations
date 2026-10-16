/**
 * Token inventory for the /design route. Values mirror DESIGN.md; the live
 * swatches read the CSS variables, so a drift between this file and
 * globals.css shows up as a swatch that does not match its printed hex.
 */

export type ColorToken = {
  name: string
  cssVar: string
  light: string
  dark: string
  use: string
}

export const coreTokens: ColorToken[] = [
  { name: "canvas", cssVar: "--background", light: "#FFFFFF", dark: "#161616", use: "Page" },
  { name: "card", cssVar: "--card", light: "#FFFFFF", dark: "#232323", use: "Cards, panels, dialogs, popovers" },
  { name: "ink", cssVar: "--foreground", light: "#222222", dark: "#F2F2F2", use: "Primary text, headings, labels" },
  { name: "body-muted", cssVar: "--muted-foreground", light: "#6C6C6C", dark: "#A3A3A3", use: "Meta lines, inactive tabs, placeholders" },
  { name: "muted-soft", cssVar: "--muted-soft", light: "#8C8C8C", dark: "#8C8C8C", use: "Tertiary counts, timestamps" },
  { name: "text-disabled", cssVar: "--text-disabled", light: "#C1C1C1", dark: "#5C5C5C", use: "Disabled controls" },
  { name: "hairline", cssVar: "--border", light: "#DDDDDD", dark: "#333333", use: "Borders, inputs, table dividers" },
  { name: "surface-soft", cssVar: "--secondary", light: "#F2F2F2", dark: "#262626", use: "Icon buttons, chips, secondary buttons" },
  { name: "surface-hover", cssVar: "--surface-hover", light: "#EBEBEB", dark: "#2E2E2E", use: "Hover on surface-soft controls" },
  { name: "surface-footer", cssVar: "--muted", light: "#F7F7F7", dark: "#1F1F1F", use: "Sidebar, muted panels, hover on transparent buttons" },
]

export const brandTokens: ColorToken[] = [
  { name: "primary (Aegean blue)", cssVar: "--primary", light: "#1D4E89", dark: "#7FB0EC", use: "Primary action, active nav, links" },
  { name: "primary-active", cssVar: "--primary-active", light: "#163D6B", dark: "#A7C9F2", use: "Pressed / hover of primary" },
  { name: "primary-soft", cssVar: "--primary-soft", light: "#EEF4FB", dark: "#10284A", use: "Selected row, active chip background" },
  { name: "on-primary", cssVar: "--primary-foreground", light: "#FFFFFF", dark: "#0B2545", use: "Text on primary" },
  { name: "focus-ring", cssVar: "--ring", light: "#222222", dark: "#F2F2F2", use: "Outer focus ring" },
]

export const chartTokens: ColorToken[] = [
  { name: "chart-1", cssVar: "--chart-1", light: "#1D4E89", dark: "#7FB0EC", use: "Categorical ramp, step 1" },
  { name: "chart-2", cssVar: "--chart-2", light: "#4F86C6", dark: "#4F86C6", use: "Step 2" },
  { name: "chart-3", cssVar: "--chart-3", light: "#9DBFE5", dark: "#2F5F9E", use: "Step 3" },
  { name: "chart-4", cssVar: "--chart-4", light: "#8C8C8C", dark: "#A3A3A3", use: "Step 4" },
  { name: "chart-5", cssVar: "--chart-5", light: "#C1C1C1", dark: "#5C5C5C", use: "Step 5" },
]

export type StatusToken = {
  name: "critical" | "warning" | "success" | "info"
  label: string
  text: [light: string, dark: string]
  bg: [light: string, dark: string]
  border: [light: string, dark: string]
  states: string
}

export const statusTokens: StatusToken[] = [
  { name: "critical", label: "Critical", text: ["#B42318", "#F97066"], bg: ["#FEF3F2", "#55160C"], border: ["#FECDCA", "#912018"], states: "Reopened, overdue against its time limit, safety" },
  { name: "warning", label: "Warning", text: ["#B54708", "#FDB022"], bg: ["#FFFAEB", "#4E1D09"], border: ["#FEDF89", "#93370D"], states: "Resolved but awaiting verification, cluster suspected" },
  { name: "success", label: "Success", text: ["#067647", "#47CD89"], bg: ["#ECFDF3", "#053321"], border: ["#ABEFC6", "#085D3A"], states: "Verified fixed" },
  { name: "info", label: "Info (violet)", text: ["#5925DC", "#9B8AFB"], bg: ["#F4F3FF", "#27115F"], border: ["#D9D6FE", "#4A1FB8"], states: "Assigned, in progress" },
]

export type TypeToken = {
  name: string
  className: string
  spec: string
  use: string
}

export const typeTokens: TypeToken[] = [
  { name: "display", className: "text-display", spec: "26 / 1.15 · 500", use: "Page title" },
  { name: "title-lg", className: "text-title-lg", spec: "22 / 1.2 · 500 · −0.44px", use: "Section heading" },
  { name: "title-md", className: "text-title-md", spec: "20 / 1.2 · 600 · −0.18px", use: "Card / panel heading" },
  { name: "title-sm", className: "text-title-sm", spec: "16 / 1.25 · 500", use: "Row title, dialog title" },
  { name: "body-lg", className: "text-body-lg", spec: "16 / 1.5 · 400", use: "Long text (SOP answers, guest messages)" },
  { name: "body", className: "text-body", spec: "14 / 1.45 · 400", use: "Default UI text" },
  { name: "body-strong", className: "text-body-strong", spec: "14 / 1.45 · 500", use: "Labels, buttons, table headers" },
  { name: "caption-lg", className: "text-caption-lg", spec: "13 / 1.25 · 400", use: "Secondary row text" },
  { name: "caption", className: "text-caption", spec: "12 / 1.35 · 400", use: "Meta: time, room, source" },
  { name: "caption-strong", className: "text-caption-strong", spec: "12 / 1.35 · 700", use: "Counts, KPI deltas" },
  { name: "micro", className: "text-micro", spec: "11 / 1.2 · 600", use: "Badges" },
]

export type ShadowToken = { name: string; className: string; use: string }

export const shadowTokens: ShadowToken[] = [
  { name: "flat", className: "shadow-none", use: "Cards, tables, page" },
  { name: "shadow-compact", className: "shadow-compact border border-border", use: "Sticky headers, condensed toolbars (+1px hairline)" },
  { name: "shadow-float", className: "shadow-float", use: "Popovers, dropdowns, toasts" },
  { name: "shadow-search", className: "shadow-search border border-border", use: "Command bar, global search pill (+1px hairline)" },
  { name: "shadow-focus", className: "shadow-focus", use: "Keyboard focus on every interactive element" },
]

export type SampleException = {
  id: string
  title: string
  meta: string
  status: StatusToken["name"]
  label: string
  selected?: boolean
}

export const sampleExceptions: SampleException[] = [
  {
    id: "EX-2291",
    title: "Reopened: air-conditioning noise in Suite 412",
    meta: "Guest complaint · Suite 412 · reopened 2h ago · 3rd occurrence this season",
    status: "critical",
    label: "Reopened",
    selected: true,
  },
  {
    id: "EX-2287",
    title: "Pool towel shortage at the beach club",
    meta: "Staff report · Pool deck · resolved by F&B, awaiting verification · due 18:00",
    status: "warning",
    label: "Awaiting verification",
  },
  {
    id: "EX-2280",
    title: "Low hot-water pressure, Villa 7",
    meta: "Work order #4471 · Villa 7 · verified fixed by Maria K. · 14:05",
    status: "success",
    label: "Verified fixed",
  },
  {
    id: "EX-2294",
    title: "Late turndown service, rooms 201–210",
    meta: "Booking.com review · Floor 2 · assigned to Housekeeping · in progress",
    status: "info",
    label: "In progress",
  },
]
