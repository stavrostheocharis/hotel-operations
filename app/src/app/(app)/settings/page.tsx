import { Suspense } from "react";

import { requireViewer } from "@/auth/viewer";
import { PageHeader } from "@/components/console/page-header";
import { PropertyForm } from "@/components/settings/property-form";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { getPropertyProfile } from "@/console/property-settings";
import { timezoneOptions } from "@/console/settings";
import { getAppDb } from "@/db";
import { t } from "@/i18n";

export const metadata = { title: t("settings.title") };

/** "How is this property set up?" Property, users, locations, categories. */
export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("settings.title")} description={t("settings.property.lead")} />
      <SettingsTabs active="property" />
      <Suspense fallback={<Skeleton className="h-96 max-w-2xl rounded-card" />}>
        <Property />
      </Suspense>
    </div>
  );
}

async function Property() {
  const viewer = await requireViewer();
  const profile = await getPropertyProfile(getAppDb(), viewer.scoped, viewer.property.id);
  if (!profile) return null;
  return <PropertyForm profile={profile} timezones={timezoneOptions(profile.timezone)} readOnly={!viewer.can("settings.property")} />;
}
