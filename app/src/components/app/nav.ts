import type { Role } from "@/auth/permissions";

/**
 * The map of the app: which sections exist, where they live, who sees them.
 * Labels come from the dictionary (`nav.<key>`); icons are resolved in the
 * client component by `icon` id, so this file stays free of React.
 */
export type NavKey =
  | "today"
  | "exceptions"
  | "verifications"
  | "signals"
  | "review"
  | "locations"
  | "reports"
  | "imports"
  | "settings"
  | "copilot"
  | "guestQr";

export type NavGroupKey = "work" | "records" | "insight" | "setup" | "coming";

export type NavItem = { key: NavKey; href: string; roles: readonly Role[]; soon?: boolean };
export type NavGroup = { key: NavGroupKey; items: readonly NavItem[] };

const ALL: readonly Role[] = ["group_admin", "gm", "dept_head", "supervisor", "staff", "readonly"];
const SUPERVISORS: readonly Role[] = ["group_admin", "gm", "dept_head", "supervisor"];
const MANAGERS: readonly Role[] = ["group_admin", "gm"];

export const NAV: readonly NavGroup[] = [
  {
    key: "work",
    items: [
      { key: "today", href: "/today", roles: ALL },
      { key: "exceptions", href: "/exceptions", roles: ALL },
      { key: "verifications", href: "/verifications", roles: ["group_admin", "gm", "dept_head", "supervisor", "staff"] },
    ],
  },
  {
    key: "records",
    items: [
      { key: "signals", href: "/signals", roles: SUPERVISORS },
      { key: "review", href: "/review", roles: SUPERVISORS },
      { key: "locations", href: "/locations", roles: ALL },
    ],
  },
  { key: "insight", items: [{ key: "reports", href: "/reports", roles: ["group_admin", "gm", "dept_head", "readonly"] }] },
  {
    key: "setup",
    items: [
      { key: "imports", href: "/imports", roles: MANAGERS },
      { key: "settings", href: "/settings", roles: ["group_admin", "gm", "dept_head"] },
    ],
  },
  {
    key: "coming",
    items: [
      { key: "copilot", href: "/copilot", roles: ALL, soon: true },
      { key: "guestQr", href: "/guest-qr", roles: ALL, soon: true },
    ],
  },
];

export function visibleNav(role: Role): NavGroup[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(role)) })).filter((g) => g.items.length > 0);
}

/** Which nav item a path belongs to (detail pages count for their section). */
export function navKeyForPath(pathname: string): NavKey | null {
  if (pathname.startsWith("/issues")) return "exceptions";
  const first = `/${pathname.split("/")[1] ?? ""}`;
  for (const g of NAV) for (const i of g.items) if (i.href === first) return i.key;
  return null;
}
