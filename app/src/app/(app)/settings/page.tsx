import { Fragment, Suspense } from "react";

import { requireViewer } from "@/auth/viewer";
import { PageHeader } from "@/components/console/page-header";
import { PropertyForm } from "@/components/settings/property-form";
import { SettingsTabs, visibleSettingsTabs } from "@/components/settings/settings-tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getPropertyProfile } from "@/console/property-settings";
import { timezoneOptions } from "@/console/settings";
import { getAppDb } from "@/db";
import { t } from "@/i18n";
import { canSee } from "@/auth/screens";
import { NotAllowed } from "@/components/console/not-allowed";

export const metadata = { title: t("settings.title") };

/** "How is this property set up?" Property, users, locations, categories. */
export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("settings.title")} description={t("settings.property.lead")} />
      <Suspense fallback={<Skeleton className="h-96 max-w-2xl rounded-card" />}>
        <Property />
      </Suspense>
    </div>
  );
}

async function Property() {
  const viewer = await requireViewer();
  if (!canSee(viewer.roleAt(), "settings")) return <NotAllowed />;
  const profile = await getPropertyProfile(getAppDb(), viewer.scoped, viewer.property.id);
  if (!profile) return null;
  const canEdit = viewer.can("settings.property");
  return (
    <>
      <SettingsTabs active="property" visible={visibleSettingsTabs(viewer)} />
      {canEdit ? (
        <PropertyForm profile={profile} timezones={timezoneOptions(profile.timezone)} />
      ) : (
        <Card className="max-w-2xl">
          <CardContent>
            <dl className="grid gap-x-6 gap-y-3 text-body sm:grid-cols-[12rem_1fr]">
              {(
                [
                  ["settings.property.name", profile.name],
                  ["settings.property.code", profile.code],
                  ["settings.property.timezone", profile.timezone],
                  ["settings.property.seasonOpen", profile.seasonOpen ?? "–"],
                  ["settings.property.seasonClose", profile.seasonClose ?? "–"],
                  ["settings.property.importTime", profile.settings.importTime ?? "–"],
                ] as const
              ).map(([k, v]) => (
                <Fragment key={k}>
                  <dt className="text-muted-foreground">{t(k)}</dt>
                  <dd className="text-foreground">{v}</dd>
                </Fragment>
              ))}
            </dl>
          </CardContent>
        </Card>
      )}
    </>
  );
}
