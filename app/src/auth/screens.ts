import type { Role } from "./permissions";
import { NAV, type NavKey } from "@/components/app/nav";

/**
 * Which roles may open a screen: the same map that draws the sidebar, so
 * hiding an item is also a boundary. Pages check it inside their Suspense
 * island and render <NotAllowed/>; route handlers answer 403.
 */
const ROLES_BY_SCREEN: Partial<Record<NavKey, readonly Role[]>> = Object.fromEntries(NAV.flatMap((g) => g.items.map((i) => [i.key, i.roles])));

export function canSee(role: Role, screen: NavKey): boolean {
  const roles = ROLES_BY_SCREEN[screen];
  return roles ? roles.includes(role) : true;
}
