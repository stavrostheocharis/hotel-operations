import { ViewTabs } from "@/components/console/view-tabs";
import { t } from "@/i18n";

export const SETTINGS_TABS = ["property", "users", "locations", "categories"] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

/** The tabs a viewer may open: users for user admins, locations for whoever may edit them, the rest for anyone in Settings. */
export function visibleSettingsTabs(viewer: { can: (cap: "users.view" | "settings.locations" | "settings.view") => boolean }): SettingsTab[] {
  return SETTINGS_TABS.filter((k) => (k === "users" ? viewer.can("users.view") : k === "locations" ? viewer.can("settings.locations") || viewer.can("settings.view") : viewer.can("settings.view")));
}

/** Settings as tabs that are routes. */
export function SettingsTabs({ active, visible = [...SETTINGS_TABS] }: { active: SettingsTab; visible?: SettingsTab[] }) {
  return <ViewTabs active={active} tabs={visible.map((k) => ({ key: k, label: t(`settings.tabs.${k}`), href: k === "property" ? "/settings" : `/settings/${k}` }))} />;
}
