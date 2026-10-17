import { CircleCheckIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { requireViewer } from "@/auth/viewer";
import { EmptyState } from "@/components/console/empty-state";
import { PageHeader } from "@/components/console/page-header";
import { PageSkeleton } from "@/components/console/page-skeleton";
import { Pager } from "@/components/console/pager";
import { ViewTabs } from "@/components/console/view-tabs";
import { DoneSheet } from "@/components/verifications/done-sheet";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate } from "@/console/format";
import { countVerificationViews, listVerifications, VERIFICATION_VIEWS, type VerificationView } from "@/console/verification";
import { getAppDb } from "@/db";
import { label, t } from "@/i18n";
import { cn } from "@/lib/utils";

export const metadata = { title: t("verifications.title") };

/**
 * "Which fixes must be checked, and did they hold?" Checks due, this
 * week, mine, done; each open one has its done form a click away.
 */
export default function VerificationsPage(props: PageProps<"/verifications">) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("verifications.title")} description={t("verifications.question")} />
      <Suspense fallback={<PageSkeleton variant="table" />}>
        <List searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

async function List({ searchParams }: Pick<PageProps<"/verifications">, "searchParams">) {
  const params = await searchParams;
  const view = (VERIFICATION_VIEWS.includes(one(params.view) as VerificationView) ? one(params.view) : "due") as VerificationView;
  const page = Math.max(1, Number(one(params.page) ?? 1) || 1);
  const viewer = await requireViewer();
  const db = getAppDb();
  const tz = viewer.property.timezone;
  const base = { timeZone: tz, userId: viewer.user.id };
  const [result, counts] = await Promise.all([listVerifications(db, viewer.scoped, { view, now: new Date(), page, ...base }), countVerificationViews(db, viewer.scoped, base)]);
  const now = new Date();
  const hrefFor = (v: VerificationView, p?: number) => `/verifications?view=${v}${p && p > 1 ? `&page=${p}` : ""}`;
  const canSkip = viewer.can("verification.schedule");

  return (
    <>
      <ViewTabs active={view} tabs={VERIFICATION_VIEWS.map((v) => ({ key: v, label: label("verifications.views", v), count: counts[v], href: hrefFor(v) }))} />
      {result.rows.length === 0 ? (
        <EmptyState icon={<CircleCheckIcon />} title={label("verifications.empty", view)} body={t("verifications.emptyHint")} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("verifications.columns.place")}</TableHead>
                  <TableHead>{t("verifications.columns.issue")}</TableHead>
                  <TableHead>{t("verifications.columns.due")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("verifications.columns.assignee")}</TableHead>
                  <TableHead>{t("verifications.columns.status")}</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((v) => {
                  const overdueDays = Math.floor((now.getTime() - v.dueAt.getTime()) / 86_400_000);
                  const dueIn = Math.ceil((v.dueAt.getTime() - now.getTime()) / 86_400_000);
                  const canDo = v.status === "open" && viewer.can("verification.complete", { ownerUserId: v.assigneeUserId, department: v.assigneeDepartment as never });
                  return (
                    <TableRow key={v.id}>
                      <TableCell className="whitespace-normal">
                        <span className="text-body-strong text-foreground">{v.locationName ?? v.locationCode ?? "–"}</span>
                        {v.locationCode && v.locationName ? <span className="text-caption text-muted-foreground"> · {v.locationCode}</span> : null}
                        {v.instructions ? <div className="text-caption text-muted-foreground">{v.instructions}</div> : null}
                      </TableCell>
                      <TableCell className="max-w-xs whitespace-normal">
                        <Link href={`/issues/${v.issueId}`} className="text-body text-foreground hover:underline focus-visible:shadow-focus focus-visible:outline-none">
                          {v.issueTitle}
                        </Link>
                      </TableCell>
                      <TableCell className={cn("text-body tabular-nums", v.status === "open" && overdueDays > 0 ? "text-critical" : "text-foreground")}>
                        {v.status !== "open" ? (v.doneAt ? fmtDate(v.doneAt, tz) : "–") : overdueDays > 0 ? t("verifications.overdue", { n: overdueDays }) : dueIn <= 0 ? t("verifications.today") : t("verifications.dueIn", { n: dueIn })}
                        <div className="text-caption text-muted-foreground">{fmtDate(v.dueAt, tz)}</div>
                      </TableCell>
                      <TableCell className="hidden text-body md:table-cell">{v.assigneeName ?? <span className="text-muted-foreground">{t("verifications.nobody")}</span>}</TableCell>
                      <TableCell>
                        <Badge variant={v.status === "done" ? (v.result === "recurred" ? "critical" : "success") : v.status === "skipped" ? "secondary" : "default"}>
                          {v.status === "done" && v.result ? label("issue.outcomeKind", v.result) : label("verifications.status", v.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {canDo ? <DoneSheet taskId={v.id} issueTitle={v.issueTitle} place={v.locationName ?? v.locationCode ?? ""} canSkip={canSkip} /> : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <Pager page={page} pageSize={25} total={result.total} href={(p) => hrefFor(view, p)} />
          </CardContent>
        </Card>
      )}
    </>
  );
}
