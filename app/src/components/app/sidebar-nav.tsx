"use client";

import {
  CalendarDaysIcon,
  CircleAlertIcon,
  ClipboardCheckIcon,
  FileTextIcon,
  GitCompareIcon,
  InboxIcon,
  MapIcon,
  QrCodeIcon,
  SettingsIcon,
  SparklesIcon,
  UploadIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { navKeyForPath, type NavKey } from "./nav";

const ICONS: Record<NavKey, React.ComponentType<{ className?: string }>> = {
  today: CalendarDaysIcon,
  exceptions: CircleAlertIcon,
  verifications: ClipboardCheckIcon,
  signals: InboxIcon,
  review: GitCompareIcon,
  locations: MapIcon,
  reports: FileTextIcon,
  imports: UploadIcon,
  settings: SettingsIcon,
  copilot: SparklesIcon,
  guestQr: QrCodeIcon,
};

export type SidebarNavGroup = {
  key: string;
  label: string;
  items: { key: NavKey; href: string; label: string; soon?: boolean; badge?: number }[];
};

/** The navigation, with the active item taken from the URL (no request reads, so the shell stays static). */
export function SidebarNav({ groups, soonLabel }: { groups: SidebarNavGroup[]; soonLabel: string }) {
  const pathname = usePathname();
  const active = navKeyForPath(pathname);
  const { setOpenMobile } = useSidebar();
  return (
    <>
      {groups.map((g) => (
        <SidebarGroup key={g.key}>
          <SidebarGroupLabel>{g.label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {g.items.map((item) => {
                const Icon = ICONS[item.key];
                return (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton
                      isActive={active === item.key}
                      tooltip={item.label}
                      render={<Link href={item.href} onClick={() => setOpenMobile(false)} />}
                    >
                      <Icon className="size-4" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                    {item.soon ? (
                      <SidebarMenuBadge className="text-muted-foreground">{soonLabel}</SidebarMenuBadge>
                    ) : item.badge ? (
                      <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
                    ) : null}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}
