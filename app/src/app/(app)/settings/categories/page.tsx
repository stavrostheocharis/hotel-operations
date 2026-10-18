import { Suspense } from "react";

import { requireViewer } from "@/auth/viewer";
import { PageHeader } from "@/components/console/page-header";
import { CategoriesForm } from "@/components/settings/categories-form";
import { SettingsTabs, visibleSettingsTabs } from "@/components/settings/settings-tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { defaultDepartmentFor, getPropertyProfile, recurrenceWindowDays } from "@/console/property-settings";
import { getAppDb, schema } from "@/db";
import { label, t } from "@/i18n";
import { CATEGORIES } from "@/normalize/taxonomy";
import { canSee } from "@/auth/screens";
import { NotAllowed } from "@/components/console/not-allowed";

export const metadata = { title: t("settings.tabs.categories") };

export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("settings.title")} description={t("settings.categories.lead")} />
      <Suspense fallback={<Skeleton className="h-96 rounded-card" />}>
        <Categories />
      </Suspense>
    </div>
  );
}

async function Categories() {
  const viewer = await requireViewer();
  if (!canSee(viewer.roleAt(), "settings")) return <NotAllowed />;
  const profile = await getPropertyProfile(getAppDb(), viewer.scoped, viewer.property.id);
  const settings = profile?.settings ?? {};
  const rows = CATEGORIES.map((c) => ({ category: c, label: label("category", c), windowDays: recurrenceWindowDays(c, settings), department: defaultDepartmentFor(c, settings) }));
  const departments = schema.department.enumValues.map((d) => ({ value: d, label: label("user.department", d) }));
  return (
    <>
      <SettingsTabs active="categories" visible={visibleSettingsTabs(viewer)} />
      <p className="max-w-3xl text-body text-muted-foreground">{t("settings.categories.hint")}</p>
      {viewer.can("settings.property") ? (
        <CategoriesForm rows={rows} departments={departments} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("settings.categories.columns.category")}</TableHead>
                  <TableHead className="text-right">{t("settings.categories.columns.window")}</TableHead>
                  <TableHead>{t("settings.categories.columns.department")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.category}>
                    <TableCell className="text-body text-foreground">{r.label}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.windowDays}</TableCell>
                    <TableCell className="text-body">{r.department ? label("user.department", r.department) : t("settings.categories.noDepartment")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
