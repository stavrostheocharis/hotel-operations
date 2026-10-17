import Link from "next/link";
import { Suspense } from "react";

import { SourceBadge, StatusBadge } from "@/components/console/badges";
import { PageHeader } from "@/components/console/page-header";
import { PageSkeleton } from "@/components/console/page-skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate, fmtHours, fmtNumber, fmtRate } from "@/console/format";
import { countIssues, getKpis, ISSUE_FILTERS, listIssues, type IssueFilter } from "@/console/queries";
import { getCurrentTenant } from "@/console/tenant";
import { getAppDb } from "@/db";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

export const metadata = { title: t("exceptions.title") };

/**
 * The exceptions queue: what came back, what is open, what points at a
 * shared cause. The frame renders at once; the data streams in behind the
 * Suspense boundary (the database read is per request).
 */
export default function ExceptionsPage(props: PageProps<"/exceptions">) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("exceptions.title")} description={t("exceptions.description")} />
      <Suspense fallback={<PageSkeleton variant="table" />}>
        <Queue searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function Queue({ searchParams }: Pick<PageProps<"/exceptions">, "searchParams">) {
  const params = await searchParams;
  const raw = Array.isArray(params.filter) ? params.filter[0] : params.filter;
  const filter: IssueFilter = ISSUE_FILTERS.some((f) => f.key === raw) ? (raw as IssueFilter) : "all";
  const tenant = await getCurrentTenant();
  const db = getAppDb();
  const [kpis, counts, list] = await Promise.all([getKpis(db, tenant), countIssues(db, tenant), listIssues(db, tenant, filter)]);

  return (
    <>
      <section aria-label="Key figures" className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label={t("exceptions.kpi.reopened")} value={String(kpis.reopened)} hint={t("exceptions.kpi.everReopened", { n: kpis.everReopened })} />
        <Kpi label={t("exceptions.kpi.reopenRate")} value={fmtRate(kpis.reopenRate)} hint={t("exceptions.kpi.withClosure", { n: kpis.withClosure })} />
        <Kpi
          label={t("exceptions.kpi.repeats")}
          value={fmtNumber(kpis.repeatsPerThousandRoomNights)}
          hint={t("exceptions.kpi.repeatsHint", { repeats: kpis.repeats, roomNights: kpis.roomNights.toLocaleString("en-GB") })}
        />
        <Kpi label={t("exceptions.kpi.median")} value={fmtHours(kpis.medianHoursToResolve)} hint={t("exceptions.kpi.medianHint")} />
      </section>

      {kpis.byCategory.length ? (
        <section aria-label="By category" className="grid gap-x-8 gap-y-1 text-caption text-muted-foreground md:grid-cols-2">
          {kpis.byCategory.map((c) => (
            <div key={c.category} className="flex items-baseline justify-between gap-4 border-b border-border py-1.5">
              <span className="text-body text-foreground">{c.category.replace(/_/g, " ")}</span>
              <span>{t("exceptions.byCategory", { issues: c.issues, reopened: c.reopened, hours: fmtHours(c.medianHours) })}</span>
            </div>
          ))}
        </section>
      ) : null}

      <nav aria-label="Filter" className="flex flex-wrap gap-2">
        {ISSUE_FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/exceptions" : `/exceptions?filter=${f.key}`}
            aria-current={f.key === filter ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1.5 text-caption-lg font-medium transition-colors focus-visible:shadow-focus focus-visible:outline-none",
              f.key === filter ? "border-primary bg-primary-soft text-primary" : "border-transparent bg-secondary text-foreground hover:bg-surface-hover",
            )}
          >
            {t(`exceptions.filters.${f.key}`)} · {counts[f.key]}
          </Link>
        ))}
      </nav>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("exceptions.columns.issue")}</TableHead>
                <TableHead>{t("exceptions.columns.rootCause")}</TableHead>
                <TableHead>{t("exceptions.columns.status")}</TableHead>
                <TableHead className="text-right">{t("exceptions.columns.reopens")}</TableHead>
                <TableHead className="text-right">{t("exceptions.columns.signals")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("exceptions.columns.sources")}</TableHead>
                <TableHead className="hidden text-right lg:table-cell">{t("exceptions.columns.period")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link href={`/issues/${r.id}`} className="text-body-strong text-foreground hover:underline focus-visible:shadow-focus focus-visible:outline-none">
                      {r.title}
                    </Link>
                    <div className="text-caption text-muted-foreground">
                      {r.category?.replace(/_/g, " ") ?? "unclassified"} · {r.severity}
                    </div>
                  </TableCell>
                  <TableCell className="text-body text-muted-foreground">
                    {r.locationCode ?? "–"}
                    {r.locationKind && r.locationKind !== "room" ? <span className="text-caption"> · {r.locationKind}</span> : null}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="text-right text-body tabular-nums">{r.reopenCount}</TableCell>
                  <TableCell className="text-right text-body tabular-nums">{r.signals}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {r.sources.split(",").map((s) => (
                        <SourceBadge key={s} source={s} />
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-right text-caption text-muted-foreground tabular-nums lg:table-cell">
                    {fmtDate(r.firstAt, tenant.timezone)} → {fmtDate(r.lastAt, tenant.timezone)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="border-t border-border px-4 py-3 text-caption text-muted-foreground">{t("exceptions.showing", { shown: list.rows.length, total: list.total })}</p>
        </CardContent>
      </Card>
    </>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4">
        <span className="text-caption-strong uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="text-title-lg text-foreground tabular-nums">{value}</span>
        <span className="text-caption text-muted-soft">{hint}</span>
      </CardContent>
    </Card>
  );
}
