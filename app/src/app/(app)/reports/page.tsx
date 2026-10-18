import Link from "next/link";

import { PageHeader } from "@/components/console/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { t } from "@/i18n";
import { canSee } from "@/auth/screens";
import { NotAllowed } from "@/components/console/not-allowed";
import { requireViewer } from "@/auth/viewer";
import { Skeleton } from "@/components/ui/skeleton";
import { Suspense } from "react";

export const metadata = { title: t("reports.title") };

/** The only screens where dense numbers are welcome. */
export default function ReportsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("reports.title")} description={t("reports.question")} />
      <Suspense fallback={<Skeleton className="h-40 rounded-card" />}>
        <Cards />
      </Suspense>
    </div>
  );
}

async function Cards() {
  const viewer = await requireViewer();
  if (!canSee(viewer.roleAt(), "reports")) return <NotAllowed />;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ReportCard href="/reports/audit" title={t("reports.audit")} lead={t("reports.auditLead")} />
      <ReportCard href="/reports/monthly" title={t("reports.monthly")} lead={t("reports.monthlyLead")} />
    </div>
  );
}

function ReportCard({ href, title, lead }: { href: string; title: string; lead: string }) {
  return (
    <Link href={href} className="rounded-card focus-visible:shadow-focus focus-visible:outline-none">
      <Card className="h-full transition-colors hover:bg-surface-hover">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{lead}</CardDescription>
        </CardHeader>
        <CardContent className="text-caption text-muted-foreground">{t("reports.seasonToDate")}</CardContent>
      </Card>
    </Link>
  );
}
