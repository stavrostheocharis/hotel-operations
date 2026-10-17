import { Suspense } from "react";

import { getViewer } from "@/auth/viewer";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarRail } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { visibleNav } from "./nav";
import { PropertySwitcher, PropertySwitcherSkeleton } from "./property-switcher";
import { SidebarNav, type SidebarNavGroup } from "./sidebar-nav";
import { UserMenu, UserMenuSkeleton } from "./user-menu";

/**
 * The left rail. The frame is static; the three parts that depend on who is
 * signed in (property, navigation by role, user menu) stream in behind their
 * own Suspense boundaries.
 */
export function AppSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Suspense fallback={<PropertySwitcherSkeleton />}>
          <PropertySwitcher />
        </Suspense>
      </SidebarHeader>
      <SidebarContent>
        <Suspense fallback={<NavSkeleton />}>
          <NavForViewer />
        </Suspense>
      </SidebarContent>
      <SidebarFooter>
        <Suspense fallback={<UserMenuSkeleton />}>
          <UserMenu />
        </Suspense>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

async function NavForViewer() {
  const viewer = await getViewer();
  const role = viewer?.roleAt() ?? "readonly";
  const groups: SidebarNavGroup[] = visibleNav(role).map((g) => ({
    key: g.key,
    label: t(`nav.${g.key}`),
    items: g.items.map((i) => ({ key: i.key, href: i.href, label: t(`nav.${i.key}`), soon: i.soon })),
  }));
  return <SidebarNav groups={groups} soonLabel={t("app.soon")} />;
}

/** Fixed widths on purpose: the shell is prerendered, so nothing in it may be random. */
function NavSkeleton() {
  const widths = ["w-16", "w-24", "w-28", "w-20", "w-16", "w-24", "w-20", "w-16"];
  return (
    <div className="flex flex-col gap-2 p-2 pt-4">
      {widths.map((w, i) => (
        <div key={i} className="flex h-8 items-center gap-2 px-2">
          <Skeleton className="size-4 rounded-sm" />
          <Skeleton className={`h-4 ${w} rounded-sm`} />
        </div>
      ))}
    </div>
  );
}
