import { Suspense } from "react";

import { requireViewer } from "@/auth/viewer";
import { PageHeader } from "@/components/console/page-header";
import { CategoriesForm } from "@/components/settings/categories-form";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { defaultDepartmentFor, getPropertyProfile, recurrenceWindowDays } from "@/console/property-settings";
import { getAppDb, schema } from "@/db";
import { label, t } from "@/i18n";
import { CATEGORIES } from "@/normalize/taxonomy";

export const metadata = { title: t("settings.tabs.categories") };

export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("settings.title")} description={t("settings.categories.lead")} />
      <SettingsTabs active="categories" />
      <p className="max-w-3xl text-body text-muted-foreground">{t("settings.categories.hint")}</p>
      <Suspense fallback={<Skeleton className="h-96 rounded-card" />}>
        <Categories />
      </Suspense>
    </div>
  );
}

async function Categories() {
  const viewer = await requireViewer();
  const profile = await getPropertyProfile(getAppDb(), viewer.scoped, viewer.property.id);
  const settings = profile?.settings ?? {};
  const rows = CATEGORIES.map((c) => ({ category: c, label: label("category", c), windowDays: recurrenceWindowDays(c, settings), department: defaultDepartmentFor(c, settings) }));
  const departments = schema.department.enumValues.map((d) => ({ value: d, label: label("user.department", d) }));
  return <CategoriesForm rows={rows} departments={departments} readOnly={!viewer.can("settings.property")} />;
}
