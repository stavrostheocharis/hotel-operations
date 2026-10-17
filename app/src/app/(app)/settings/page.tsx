import { ConstructionIcon } from "lucide-react";

import { EmptyState } from "@/components/console/empty-state";
import { PageHeader } from "@/components/console/page-header";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { t } from "@/i18n";

export const metadata = { title: t("settings.title") };

/** "How is this property set up?" Property, users, locations, categories. */
export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("settings.title")} description={t("settings.property.lead")} />
      <SettingsTabs active="property" />
      <EmptyState icon={<ConstructionIcon />} title={t("common.arrivesIn", { step: 7 })} body={t("settings.property.lead")} />
    </div>
  );
}
