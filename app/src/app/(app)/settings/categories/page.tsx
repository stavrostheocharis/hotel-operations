import { ConstructionIcon } from "lucide-react";

import { EmptyState } from "@/components/console/empty-state";
import { PageHeader } from "@/components/console/page-header";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { t } from "@/i18n";

export const metadata = { title: t("settings.tabs.categories") };

export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("settings.title")} description={t("settings.categories.lead")} />
      <SettingsTabs active="categories" />
      <EmptyState icon={<ConstructionIcon />} title={t("common.arrivesIn", { step: 7 })} body={t("settings.categories.lead")} />
    </div>
  );
}
