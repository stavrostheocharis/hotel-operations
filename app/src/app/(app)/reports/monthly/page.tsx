import { DownloadIcon, TableIcon } from "lucide-react";
import { Suspense } from "react";

import { requireViewer } from "@/auth/viewer";
import { EmptyState } from "@/components/console/empty-state";
import { PageHeader } from "@/components/console/page-header";
import { PageSkeleton } from "@/components/console/page-skeleton";
import { PrintButton } from "@/components/console/print-button";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtHours, fmtNumber, fmtRate } from "@/console/format";
import { buildMonthlyReport, type CategoryRow, type MonthRow } from "@/console/reports";
import { getAppDb } from "@/db";
import { label, t } from "@/i18n";
import { cn } from "@/lib/utils";

export const metadata = { title: t("reports.monthly") };

/** "Are we getting better month by month?" The one dense table, plus the same per category. */
export default function MonthlyPage(props: PageProps<"/reports/monthly">) {
  return (
    <Suspense fallback={<PageSkeleton variant="table" />}>
      <Monthly searchParams={props.searchParams} />
    </Suspense>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const valid = (s: string | undefined) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);
const int = (n: number) => n.toLocaleString("en-GB");

async function Monthly({ searchParams }: Pick<PageProps<"/reports/monthly">, "searchParams">) {
  const params = await searchParams;
  const from = valid(one(params.from));
  const to = valid(one(params.to));
  const viewer = await requireViewer();
  const r = await buildMonthlyReport(getAppDb(), viewer.scoped, { from, to });
  const exportHref = (format: string) => `/reports/monthly/export?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}), format })}`;
  const monthName = (m: string) => new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" }).format(new Date(`${m}-01T12:00:00Z`));
  const noRoomNights = r.totals.roomNights === 0;

  return (
    <article className="flex flex-col gap-8">
      <PageHeader
        crumbs={[{ label: t("reports.title"), href: "/reports" }, { label: t("reports.monthly") }]}
        title={`${r.property.name} · ${t("reports.monthly")}`}
        description={`${t("reports.period", { from: r.season.from, to: r.season.to })} · ${int(r.totals.records)} ${t("reports.columns.records").toLowerCase()} · ${int(r.totals.issuesOpened)} ${t("reports.columns.opened").toLowerCase()}${noRoomNights ? ` · ${t("reports.noRoomNights")}` : ""}`}
        actions={
          <>
            <PrintButton />
            <a href={exportHref("csv")} download className={buttonVariants({ variant: "secondary" })}>
              <DownloadIcon data-icon="inline-start" />
              {t("reports.csv")}
            </a>
          </>
        }
      />
      {r.totals.records === 0 ? (
        <EmptyState icon={<TableIcon />} title={t("reports.empty")} />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t("reports.byMonth")}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("reports.columns.month")}</TableHead>
                    <Th hint={t("reports.hints.records")}>{t("reports.columns.records")}</Th>
                    <Th hint={t("reports.hints.opened")}>{t("reports.columns.opened")}</Th>
                    <Th hint={t("reports.hints.reopened")}>{t("reports.columns.reopened")}</Th>
                    <Th hint={t("reports.hints.repeats")}>{t("reports.columns.repeats")}</Th>
                    <Th hint={t("reports.hints.held")}>{t("reports.columns.held")}</Th>
                    <Th hint={t("reports.hints.median")}>{t("reports.columns.median")}</Th>
                    <Th hint={t("reports.hints.verified")}>{t("reports.columns.verified")}</Th>
                    <Th hint={t("reports.hints.closedUnverified")}>{t("reports.columns.closedUnverified")}</Th>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.months.map((m) => (
                    <MonthTr key={m.month} row={m} name={monthName(m.month)} />
                  ))}
                  <MonthTr row={r.totals} name={t("reports.season")} total />
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("reports.byCategory")}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("reports.columns.category")}</TableHead>
                    <TableHead className="text-right">{t("reports.columns.issues")}</TableHead>
                    <TableHead className="text-right">{t("reports.columns.reopened")}</TableHead>
                    <TableHead className="text-right">{t("reports.columns.repeatsShort")}</TableHead>
                    <TableHead className="text-right">{t("reports.columns.closures")}</TableHead>
                    <TableHead className="text-right">{t("reports.columns.held")}</TableHead>
                    <TableHead className="text-right">{t("reports.columns.median")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.byCategory.map((c) => (
                    <CategoryTr key={c.category} row={c} />
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </article>
  );
}

function Th({ children, hint }: { children: string; hint: string }) {
  return (
    <TableHead className="text-right" title={hint}>
      {children}
    </TableHead>
  );
}

function MonthTr({ row, name, total }: { row: MonthRow; name: string; total?: boolean }) {
  const cls = cn("text-right tabular-nums", total && "text-body-strong");
  return (
    <TableRow className={cn(total && "bg-secondary")}>
      <TableCell className={cn("text-body text-foreground", total && "text-body-strong")}>{name}</TableCell>
      <TableCell className={cls}>{int(row.records)}</TableCell>
      <TableCell className={cls}>{int(row.issuesOpened)}</TableCell>
      <TableCell className={cn(cls, row.reopened > 0 && "text-critical")}>{int(row.reopened)}</TableCell>
      <TableCell className={cls}>
        {fmtNumber(row.repeatsPerThousandRoomNights, 2)}
        <span className="text-caption text-muted-foreground"> ({int(row.repeats)})</span>
      </TableCell>
      <TableCell className={cls}>
        {row.closures ? `${int(row.held30)} / ${int(row.closures)}` : "–"}
        {row.held30Share !== null ? <span className="text-caption text-muted-foreground"> {fmtRate(row.held30Share)}</span> : null}
      </TableCell>
      <TableCell className={cls}>{fmtHours(row.medianHours)}</TableCell>
      <TableCell className={cls}>{int(row.verified)}</TableCell>
      <TableCell className={cn(cls, row.closedUnverified > 0 && "text-warning")}>{int(row.closedUnverified)}</TableCell>
    </TableRow>
  );
}

function CategoryTr({ row }: { row: CategoryRow }) {
  return (
    <TableRow>
      <TableCell className="text-body text-foreground">{label("category", row.category)}</TableCell>
      <TableCell className="text-right tabular-nums">{int(row.issues)}</TableCell>
      <TableCell className={cn("text-right tabular-nums", row.reopened > 0 && "text-critical")}>{int(row.reopened)}</TableCell>
      <TableCell className="text-right tabular-nums">{int(row.repeats)}</TableCell>
      <TableCell className="text-right tabular-nums">{int(row.closures)}</TableCell>
      <TableCell className="text-right tabular-nums">
        {row.closures ? `${int(row.held30)} / ${int(row.closures)}` : "–"}
        {row.held30Share !== null ? <span className="text-caption text-muted-foreground"> {fmtRate(row.held30Share)}</span> : null}
      </TableCell>
      <TableCell className="text-right tabular-nums">{fmtHours(row.medianHours)}</TableCell>
    </TableRow>
  );
}
