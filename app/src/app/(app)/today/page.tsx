import { CircleCheckIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { requireViewer } from "@/auth/viewer";
import { StatusBadge } from "@/components/console/badges";
import { PageHeader } from "@/components/console/page-header";
import { PageSkeleton } from "@/components/console/page-skeleton";
import { RelativeTime } from "@/components/console/relative-time";
import { RowMenu } from "@/components/exceptions/row-menu";
import { DoneSheet } from "@/components/verifications/done-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtDateTime } from "@/console/format";
import { listAssignableUsers } from "@/console/issue-detail";
import { getTodayDigest, type IssueBrief } from "@/console/today";
import { getAppDb, schema } from "@/db";
import { label, t } from "@/i18n";
import { cn } from "@/lib/utils";
import { canSee } from "@/auth/screens";

export const metadata = { title: t("today.title") };

/**
 * "What needs a person today?" Three short lists: what came back this
 * week, what is open with no owner, which checks are due. The header line
 * says how many records arrived today and when the last import ran.
 */
export default function TodayPage(props: PageProps<"/today">) {
  return (
    <Suspense fallback={<PageSkeleton variant="blocks" />}>
      <Today searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Today({ searchParams }: Pick<PageProps<"/today">, "searchParams">) {
  const params = await searchParams;
  const viewer = await requireViewer();
  const db = getAppDb();
  const tz = viewer.property.timezone;
  const myDepartment = viewer.user.department;
  const scopeParam = Array.isArray(params.scope) ? params.scope[0] : params.scope;
  const canChoose = Boolean(myDepartment) && viewer.roleAt() !== "gm" && viewer.roleAt() !== "group_admin";
  const mine = canChoose && scopeParam !== "all";
  const [digest, users] = await Promise.all([
    getTodayDigest(db, viewer.scoped, { timeZone: tz, userId: viewer.user.id, department: mine ? myDepartment : null }),
    listAssignableUsers(db, viewer.scoped, viewer.property.id),
  ]);
  const now = new Date();
  const dateText = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(now);
  const bySource = digest.todayRecords.bySource.map((s) => `${s.count} ${label("source", s.source).toLowerCase()}`).join(", ");
  const strip = digest.todayRecords.total ? t("today.strip", { date: dateText, n: digest.todayRecords.total, bySource }) : t("today.stripNone", { date: dateText });
  const departments = schema.department.enumValues.map((d) => ({ value: d, label: label("user.department", d) }));
  const canAssign = viewer.can("issue.assign");
  const canSchedule = viewer.can("verification.schedule");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("today.title")}
        description={
          <>
            {canSee(viewer.roleAt(), "signals") ? (
              <Link href="/signals" className="hover:underline">
                {strip}
              </Link>
            ) : (
              <span>{strip}</span>
            )}
            {digest.lastImportAt ? <span className="text-muted-soft"> · {t("today.lastImport", { when: fmtDateTime(digest.lastImportAt, tz) })}</span> : null}
          </>
        }
      />
      {canChoose ? (
        <div className="flex gap-2">
          <Chip href="/today" active={mine}>
            {t("today.mine", { department: label("user.department", myDepartment!) })}
          </Chip>
          <Chip href="/today?scope=all" active={!mine}>
            {t("today.all")}
          </Chip>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Block title={t("today.cameBack")} total={digest.cameBack.total} seeAll="/exceptions?view=attention" empty={t("today.emptyCameBack")}>
          {digest.cameBack.rows.map((i) => (
            <IssueLine key={i.id} issue={i} now={now} tz={tz} when={i.recurredAt ?? i.lastAt} />
          ))}
        </Block>
        <Block title={t("today.unassigned")} total={digest.unassigned.total} seeAll="/exceptions?view=attention" empty={t("today.emptyUnassigned")}>
          {digest.unassigned.rows.map((i) => (
            <IssueLine
              key={i.id}
              issue={i}
              now={now}
              tz={tz}
              when={i.openedAt}
              whenLabel="open"
              action={
                <RowMenu
                  issue={{ id: i.id, title: i.title, status: i.status, category: null, severity: "medium", department: i.department, ownerUserId: null, ownerName: null }}
                  users={users}
                  departments={departments}
                  canAssign={canAssign}
                  canSchedule={canSchedule}
                />
              }
            />
          ))}
        </Block>
        <Block title={t("today.due")} total={digest.verificationsDue.total} seeAll={canSee(viewer.roleAt(), "verifications") ? "/verifications" : undefined} empty={t("today.emptyDue")}>
          {digest.verificationsDue.rows.map((v) => {
            const overdueDays = Math.floor((now.getTime() - v.dueAt.getTime()) / 86_400_000);
            return (
              <li key={v.id} className="flex items-start justify-between gap-3 py-2">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-body-strong text-foreground">{v.locationName ?? v.locationCode ?? "–"}</span>
                  <Link href={`/issues/${v.issueId}`} className="truncate text-caption text-muted-foreground hover:underline">
                    {v.issueTitle}
                  </Link>
                  <span className={cn("text-caption", overdueDays > 0 ? "text-critical" : "text-muted-foreground")}>
                    {overdueDays > 0 ? t("verifications.overdue", { n: overdueDays }) : t("verifications.today")}
                    {v.assigneeName ? ` · ${v.assigneeName}` : ""}
                  </span>
                </div>
                {viewer.can("verification.complete", { ownerUserId: v.assigneeUserId, department: v.assigneeDepartment as never }) ? (
                  <DoneSheet taskId={v.id} issueTitle={v.issueTitle} place={v.locationName ?? v.locationCode ?? ""} canSkip={canSchedule} />
                ) : null}
              </li>
            );
          })}
        </Block>
      </div>
    </div>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-full border px-3 py-1.5 text-caption-lg font-medium transition-colors focus-visible:shadow-focus focus-visible:outline-none",
        active ? "border-primary bg-primary-soft text-primary" : "border-transparent bg-secondary text-foreground hover:bg-surface-hover",
      )}
    >
      {children}
    </Link>
  );
}

function Block({ title, total, seeAll, empty, children }: { title: string; total: number; seeAll?: string; empty: string; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>
          {title} · {total}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col pt-0">
        {total === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
            <CircleCheckIcon className="size-6 text-muted-foreground" />
            <p className="text-body text-muted-foreground">{empty}</p>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border">{children}</ul>
        )}
        {total > 5 && seeAll ? (
          <div className="mt-3">
            <Button variant="ghost" render={<Link href={seeAll} />}>
              {t("today.seeAll", { n: total })} →
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function IssueLine({ issue, now, tz, when, whenLabel, action }: { issue: IssueBrief; now: Date; tz: string; when: Date | null; whenLabel?: "open"; action?: React.ReactNode }) {
  return (
    <li className="flex items-start justify-between gap-3 py-2">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Link href={`/issues/${issue.id}`} className="text-body-strong text-foreground hover:underline focus-visible:shadow-focus focus-visible:outline-none">
          {issue.title}
        </Link>
        <div className="flex flex-wrap items-center gap-1.5 text-caption text-muted-foreground">
          {issue.locationName ? <span>{issue.locationName}</span> : null}
          <StatusBadge status={issue.status} />
          {issue.reopenCount > 0 ? <Badge variant="critical">{t("exceptions.row.back", { n: issue.reopenCount })}</Badge> : null}
          {when ? (
            <span>
              {whenLabel === "open" ? `${t("today.openFor", { when: "" }).trim()} ` : ""}
              <RelativeTime at={when} now={now} timeZone={tz} />
            </span>
          ) : null}
        </div>
      </div>
      {action}
    </li>
  );
}
