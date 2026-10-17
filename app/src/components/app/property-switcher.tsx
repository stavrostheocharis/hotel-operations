import { Building2Icon } from "lucide-react";

import { switchProperty } from "@/auth/actions";
import { getViewer } from "@/auth/viewer";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { PropertySwitcherMenu } from "./property-switcher-menu";

/** The property the console shows. A menu only when the viewer may see several. */
export async function PropertySwitcher() {
  const viewer = await getViewer();
  if (!viewer) return <PropertySwitcherSkeleton />;
  if (viewer.properties.length > 1) {
    return (
      <PropertySwitcherMenu
        properties={viewer.properties.map((p) => ({ id: p.id, name: p.name, code: p.code }))}
        selectedId={viewer.property.id}
        switchProperty={switchProperty}
        label={t("user.switchProperty")}
      />
    );
  }
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" className="pointer-events-none" tooltip={viewer.property.name}>
          <span className="flex size-8 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Building2Icon className="size-4" />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-body-strong text-foreground">{viewer.property.name}</span>
            <span className="text-caption text-muted-foreground">{viewer.property.code}</span>
          </span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export function PropertySwitcherSkeleton() {
  return (
    <div className="flex h-12 items-center gap-2 px-2">
      <Skeleton className="size-8 rounded-full" />
      <div className="flex flex-col gap-1">
        <Skeleton className="h-4 w-32 rounded-sm" />
        <Skeleton className="h-3 w-16 rounded-sm" />
      </div>
    </div>
  );
}
