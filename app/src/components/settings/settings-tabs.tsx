import { ViewTabs } from "@/components/console/view-tabs";
import { t } from "@/i18n";

export const SETTINGS_TABS = ["property", "users", "locations", "categories"] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

/** Settings as tabs that are routes. */
export function SettingsTabs({ active }: { active: SettingsTab }) {
  return <ViewTabs active={active} tabs={SETTINGS_TABS.map((k) => ({ key: k, label: t(`settings.tabs.${k}`), href: k === "property" ? "/settings" : `/settings/${k}` }))} />;
}
