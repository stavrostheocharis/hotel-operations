import { CircleCheckIcon, SearchXIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { requireViewer } from "@/auth/viewer";
import { StatusBadge } from "@/components/console/badges";
import { EmptyState } from "@/components/console/empty-state";
import { PageHeader } from "@/components/console/page-header";
import { PageSkeleton } from "@/components/console/page-skeleton";
import { Pager } from "@/components/console/pager";
import { RelativeTime } from "@/components/console/relative-time";
import { ViewTabs } from "@/components/console/view-tabs";
import { FilterBar } from "@/components/exceptions/filter-bar";
import { RowMenu } from "@/components/exceptions/row-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listAssignableUsers } from "@/console/issue-detail";
import { countIssueViews, ISSUE_SORTS, ISSUE_VIEWS, queryIssues, type IssueSort, type IssueView } from "@/console/queries";
import { getAppDb, schema } from "@/db";
import { label, t } from "@/i18n";
import { CATEGORIES } from "@/normalize/taxonomy";

export const metadata = { title: t("exceptions.title") };

/**
 * "Which problems are not finished?" Saved views as tabs, a toolbar whose
 * state lives in the URL, and rows that show what you do with an issue
 * (status, owner, last activity, came back) rather than how big it is.
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

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

async function Queue({ searchParams }: Pick<PageProps<"/exceptions">, "searchParams">) {
  const params = await searchParams;
  const view = (ISSUE_VIEWS.includes(one(params.view) as IssueView) ? one(params.view) : "attention") as IssueView;
  const sort = (ISSUE_SORTS.includes(one(params.sort) as IssueSort) ? one(params.sort) : "came_back") as IssueSort;
  const q = one(params.q);
  const department = one(params.department);
  const category = one(params.category);
  const critical = one(params.critical) === "1";
  const page = Math.max(1, Number(one(params.page) ?? 1) || 1);

  const viewer = await requireViewer();
  const db = getAppDb();
  const filters = { q, department, category, critical };
  const [result, counts, users] = await Promise.all([
    queryIssues(db, viewer.scoped, { view, sort, page, ...filters }),
    countIssueViews(db, viewer.scoped, filters),
    listAssignableUsers(db, viewer.scoped, viewer.property.id),
  ]);
  const now = new Date();
  const tz = viewer.property.timezone;
  const keep = new URLSearchParams();
  for (const [k, v] of Object.entries({ q, department, category, critical: critical ? "1" : null, sort: sort !== "came_back" ? sort : null })) if (v) keep.set(k, v);
  const hrefFor = (v: IssueView, p?: number) => {
    const u = new URLSearchParams(keep);
    if (v !== "attention") u.set("view", v);
    if (p && p > 1) u.set("page", String(p));
    const s = u.toString();
    return `/exceptions${s ? `?${s}` : ""}`;
  };
  const departments = schema.department.enumValues.map((d) => ({ value: d, label: label("user.department", d) }));
  const categories = CATEGORIES.map((c) => ({ value: c, label: c.replace(/_/g, " ") }));
  const sorts = ISSUE_SORTS.map((s) => ({ value: s, label: label("exceptions.sort", s) }));

  return (
    <>
      <ViewTabs active={view} tabs={ISSUE_VIEWS.map((v) => ({ key: v, label: label("exceptions.views", v), count: counts[v], href: hrefFor(v) }))} />
      <FilterBar departments={departments} categories={categories} sorts={sorts} />
      {result.rows.length === 0 ? (
        q ? (
          <EmptyState icon={<SearchXIcon />} title={t("exceptions.empty.search", { q })} body={t("exceptions.empty.searchHint")} action={<Button variant="secondary" render={<Link href="/exceptions" />}>{t("exceptions.toolbar.clear")}</Button>} />
        ) : view === "attention" ? (
          <EmptyState icon={<CircleCheckIcon />} title={t("exceptions.empty.attention")} body={t("exceptions.empty.attentionHint")} />
        ) : (
          <EmptyState icon={<CircleCheckIcon />} title={t("exceptions.empty.view")} />
        )
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("exceptions.columns.issue")}</TableHead>
                  <TableHead>{t("exceptions.columns.status")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("exceptions.row.owner")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t("exceptions.row.lastActivity")}</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="max-w-md whitespace-normal">
                      <Link href={`/issues/${r.id}`} className="text-body-strong text-foreground hover:underline focus-visible:shadow-focus focus-visible:outline-none">
                        {r.title}
                      </Link>
                      <div className="text-caption text-muted-foreground">
                        {[r.parentName && r.locationKind === "room" ? `${r.parentName} › ${r.locationCode}` : r.locationName ? `${r.locationName}${r.locationKind !== "room" ? ` (${r.locationKind})` : ""}` : null, r.category?.replace(/_/g, " ") ?? "unclassified"]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={r.status} />
                        {r.reopenCount > 0 ? <Badge variant="critical">{t("exceptions.row.back", { n: r.reopenCount })}</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-body md:table-cell">
                      {r.ownerName ? (
                        <span className="text-foreground">
                          {r.ownerName}
                          {r.department ? <span className="text-caption text-muted-foreground"> · {label("user.department", r.department)}</span> : null}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{t("exceptions.row.unassigned")}</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-caption text-muted-foreground lg:table-cell">
                      <RelativeTime at={r.lastActivityAt} now={now} timeZone={tz} />
                    </TableCell>
                    <TableCell className="text-right">
                      <RowMenu
                        issue={{ id: r.id, title: r.title, status: r.status, category: r.category, severity: r.severity, department: r.department, ownerUserId: r.ownerUserId, ownerName: r.ownerName }}
                        users={users}
                        departments={departments}
                        canAssign={viewer.can("issue.assign", { department: r.department as never, ownerUserId: r.ownerUserId })}
                        canSchedule={viewer.can("verification.schedule", { department: r.department as never, ownerUserId: r.ownerUserId })}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pager page={result.page} pageSize={result.pageSize} total={result.total} href={(p) => hrefFor(view, p)} />
          </CardContent>
        </Card>
      )}
    </>
  );
}
