import Link from "next/link";
import { Suspense } from "react";

import { SourceBadge, StatusBadge } from "@/components/console/badges";
import { ConsoleShell } from "@/components/console/shell";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate, fmtHours, fmtNumber, fmtRate } from "@/console/format";
import { countIssues, getKpis, ISSUE_FILTERS, listIssues, type IssueFilter } from "@/console/queries";
import { getCurrentTenant } from "@/console/tenant";
import { getAppDb } from "@/db";
import { cn } from "@/lib/utils";

export const metadata = { title: "Exceptions" };

/**
 * The exceptions queue: what came back, what is open, what points at a
 * shared cause. The frame renders at once; the data streams in behind the
 * Suspense boundary (the database read is per request).
 */
export default function ExceptionsPage(props: PageProps<"/">) {
  return (
    <ConsoleShell active="exceptions">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-display text-foreground">Exceptions</h1>
          <p className="text-body text-muted-foreground">
            Issues the engine linked across tickets, complaints, surveys and reviews, ranked by what came back.
          </p>
        </div>
        <Suspense fallback={<QueueSkeleton />}>
          <Queue searchParams={props.searchParams} />
        </Suspense>
      </div>
    </ConsoleShell>
  );
}

async function Queue({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const params = await searchParams;
  const raw = Array.isArray(params.filter) ? params.filter[0] : params.filter;
  const filter: IssueFilter = ISSUE_FILTERS.some((f) => f.key === raw) ? (raw as IssueFilter) : "all";
  const tenant = await getCurrentTenant();
  const db = getAppDb();
  const [kpis, counts, list] = await Promise.all([getKpis(db, tenant), countIssues(db, tenant), listIssues(db, tenant, filter)]);

  return (
    <>
      <section aria-label="Key figures" className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label="Reopened" value={String(kpis.reopened)} hint={`${kpis.everReopened} ever reopened`} />
        <Kpi label="Reopen rate" value={fmtRate(kpis.reopenRate)} hint={`of ${kpis.withClosure} issues with a closure`} />
        <Kpi label="Repeats / 1,000 room-nights" value={fmtNumber(kpis.repeatsPerThousandRoomNights)} hint={`${kpis.repeats} repeats, ${kpis.roomNights.toLocaleString("en-GB")} occupied room-nights`} />
        <Kpi label="Median time to resolve" value={fmtHours(kpis.medianHoursToResolve)} hint="first signal to ticket closure" />
      </section>

      {kpis.byCategory.length ? (
        <section aria-label="By category" className="grid gap-x-8 gap-y-1 text-caption text-muted-foreground md:grid-cols-2">
          {kpis.byCategory.map((c) => (
            <div key={c.category} className="flex items-baseline justify-between gap-4 border-b border-border py-1.5">
              <span className="text-body text-foreground">{c.category.replace(/_/g, " ")}</span>
              <span>
                {c.issues} issues · {c.reopened} reopened · {fmtHours(c.medianHours)} to resolve
              </span>
            </div>
          ))}
        </section>
      ) : null}

      <nav aria-label="Filter" className="flex flex-wrap gap-2">
        {ISSUE_FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/" : `/?filter=${f.key}`}
            aria-current={f.key === filter ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1.5 text-caption-lg font-medium transition-colors focus-visible:shadow-focus focus-visible:outline-none",
              f.key === filter ? "border-primary bg-primary-soft text-primary" : "border-transparent bg-secondary text-foreground hover:bg-surface-hover",
            )}
          >
            {f.label} · {counts[f.key]}
          </Link>
        ))}
      </nav>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Issue</TableHead>
                <TableHead>Root cause</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Reopens</TableHead>
                <TableHead className="text-right">Signals</TableHead>
                <TableHead className="hidden md:table-cell">Sources</TableHead>
                <TableHead className="hidden text-right lg:table-cell">Period</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link href={`/issues/${r.id}`} className="text-body-strong text-foreground hover:underline focus-visible:shadow-focus focus-visible:outline-none">
                      {r.title}
                    </Link>
                    <div className="text-caption text-muted-foreground">{r.category?.replace(/_/g, " ") ?? "unclassified"} · {r.severity}</div>
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
          <p className="border-t border-border px-4 py-3 text-caption text-muted-foreground">
            Showing {list.rows.length} of {list.total} issues · {tenant.name}
          </p>
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

function QueueSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-card" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-card" />
    </div>
  );
}
