import Link from "next/link";

import { PageHeader } from "@/components/console/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { t } from "@/i18n";

export const metadata = { title: t("reports.title") };

/** The only screens where dense numbers are welcome. */
export default function ReportsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("reports.title")} description={t("reports.question")} />
      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/reports/audit" className="rounded-card focus-visible:shadow-focus focus-visible:outline-none">
          <Card className="h-full transition-colors hover:bg-surface-hover">
            <CardHeader>
              <CardTitle>{t("reports.audit")}</CardTitle>
              <CardDescription>Baseline, recurring failures, fixes that did not hold, winter-works list, records assessment. Print it for the PDF.</CardDescription>
            </CardHeader>
            <CardContent className="text-caption text-muted-foreground">Season to date</CardContent>
          </Card>
        </Link>
        <Card className="h-full">
          <CardHeader>
            <CardTitle>{t("reports.monthly")}</CardTitle>
            <CardDescription>Records, issues, repeats per 1,000 room-nights, closures held and time to resolve, month by month.</CardDescription>
          </CardHeader>
          <CardContent className="text-caption text-muted-foreground">{t("common.arrivesIn", { step: 7 })}</CardContent>
        </Card>
      </div>
    </div>
  );
}
