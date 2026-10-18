import { InboxIcon, SearchXIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { requireViewer } from "@/auth/viewer";
import { SourceBadge, StatusBadge } from "@/components/console/badges";
import { EmptyState } from "@/components/console/empty-state";
import { PageHeader } from "@/components/console/page-header";
import { PageSkeleton } from "@/components/console/page-skeleton";
import { Pager } from "@/components/console/pager";
import { ViewTabs } from "@/components/console/view-tabs";
import { SignalsFilterBar } from "@/components/signals/filter-bar";
import { RecordDrawer } from "@/components/signals/record-drawer";
import { RecordPanel } from "@/components/signals/record-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDateTime } from "@/console/format";
import { listAssignableUsers } from "@/console/issue-detail";
import { countSignalViews, getSignal, listPlaces, listSignals, SIGNAL_VIEWS, suggestIssuesForSignal, type SignalView } from "@/console/signals";
import { getAppDb, schema } from "@/db";
import { label, t } from "@/i18n";
import { CATEGORIES } from "@/normalize/taxonomy";
import { cn } from "@/lib/utils";
import { canSee } from "@/auth/screens";
import { NotAllowed } from "@/components/console/not-allowed";

export const metadata = { title: t("signals.title") };

/**
 * "What came in, and did each record find its problem?" Every record as
 * it arrived, newest first; a row opens the record in a drawer whose state
 * is the URL (`?record=`).
 */
export default function SignalsPage(props: PageProps<"/signals">) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("signals.title")} description={t("signals.question")} />
      <Suspense fallback={<PageSkeleton variant="table" />}>
        <Inbox searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
const isDate = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);

async function Inbox({ searchParams }: Pick<PageProps<"/signals">, "searchParams">) {
  const params = await searchParams;
  const view = (SIGNAL_VIEWS.includes(one(params.view) as SignalView) ? one(params.view) : "unlinked") as SignalView;
  const q = one(params.q);
  const source = one(params.source);
  const category = one(params.category);
  const from = isDate(one(params.from));
  const to = isDate(one(params.to));
  const nonEnglish = one(params.nonEnglish) === "1";
  const page = Math.max(1, Number(one(params.page) ?? 1) || 1);
  const record = one(params.record);

  const viewer = await requireViewer();
  if (!canSee(viewer.roleAt(), "signals")) return <NotAllowed />;
  const db = getAppDb();
  const tz = viewer.property.timezone;
  const filters = { timeZone: tz, q, source, category, from, to, nonEnglish };
  const [result, counts] = await Promise.all([listSignals(db, viewer.scoped, { view, page, ...filters }), countSignalViews(db, viewer.scoped, filters)]);

  const keep = new URLSearchParams();
  for (const [k, v] of Object.entries({ q, source, category, from, to, nonEnglish: nonEnglish ? "1" : null })) if (v) keep.set(k, v);
  const hrefFor = (v: SignalView, p?: number, rec?: string | null) => {
    const u = new URLSearchParams(keep);
    if (v !== "unlinked") u.set("view", v);
    if (p && p > 1) u.set("page", String(p));
    if (rec) u.set("record", rec);
    const s = u.toString();
    return `/signals${s ? `?${s}` : ""}`;
  };
  const sources = schema.signalSource.enumValues.filter((s) => s !== "pms").map((s) => ({ value: s, label: label("source", s) }));
  const categories = CATEGORIES.map((c) => ({ value: c, label: c.replace(/_/g, " ") }));

  let drawer: React.ReactNode = null;
  if (record) {
    const rec = await getSignal(db, viewer.tenant, record);
    if (rec) {
      const [suggestions, places, users] = await Promise.all([suggestIssuesForSignal(db, viewer.scoped, rec), listPlaces(db, viewer.scoped), listAssignableUsers(db, viewer.scoped, viewer.property.id)]);
      const idx = result.rows.findIndex((r) => r.id === record);
      const prev = idx > 0 ? result.rows[idx - 1].id : null;
      const next = idx >= 0 && idx < result.rows.length - 1 ? result.rows[idx + 1].id : null;
      drawer = (
        <RecordDrawer
          listHref={hrefFor(view, page)}
          prevHref={prev ? hrefFor(view, page, prev) : null}
          nextHref={next ? hrefFor(view, page, next) : null}
          pageHref={`/signals/${rec.id}`}
          title={`${label("source", rec.source)} #${rec.externalId}`}
          description={`${fmtDateTime(rec.occurredAt, tz)}${rec.locationCode ? ` · ${rec.locationCode}` : ""}`}
        >
          <RecordPanel record={rec} suggestions={suggestions} places={places} users={users} tz={tz} canReview={viewer.can("signals.review")} canLink={viewer.can("links.decide")} />
        </RecordDrawer>
      );
    }
  }

  return (
    <>
      <ViewTabs active={view} tabs={SIGNAL_VIEWS.map((v) => ({ key: v, label: label("signals.views", v), count: counts[v], href: hrefFor(v) }))} />
      <SignalsFilterBar key={keep.toString()} sources={sources} categories={categories} />
      {result.rows.length === 0 ? (
        q ? (
          <EmptyState icon={<SearchXIcon />} title={t("signals.empty.search", { q })} action={<Button variant="secondary" render={<Link href="/signals" />}>{t("signals.toolbar.clear")}</Button>} />
        ) : (
          <EmptyState icon={<InboxIcon />} title={label("signals.empty", view)} />
        )
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("signals.columns.when")}</TableHead>
                  <TableHead>{t("signals.columns.source")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("signals.columns.place")}</TableHead>
                  <TableHead>{t("signals.columns.text")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t("signals.columns.belongs")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((r) => (
                  <TableRow key={r.id} className={cn(record === r.id && "bg-primary-soft/40")}>
                    <TableCell className="text-caption text-muted-foreground tabular-nums">
                      <Link href={hrefFor(view, page, r.id)} className="hover:underline focus-visible:shadow-focus focus-visible:outline-none">
                        {fmtDateTime(r.occurredAt, tz)}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <SourceBadge source={r.source} />
                    </TableCell>
                    <TableCell className="hidden text-body md:table-cell">
                      {r.locationCode ? <span className="text-foreground">{r.locationCode}</span> : <span className="text-muted-foreground">{t("signals.noPlace")}</span>}
                      {r.topic || r.category ? <div className="text-caption text-muted-foreground">{(r.topic ?? r.category ?? "").replace(/_/g, " ")}</div> : null}
                    </TableCell>
                    <TableCell className="max-w-md whitespace-normal">
                      <Link href={hrefFor(view, page, r.id)} className="line-clamp-2 text-body text-foreground hover:underline focus-visible:shadow-focus focus-visible:outline-none">
                        {r.text ?? <span className="text-muted-soft">{t("issue.noText")}</span>}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {r.issueId ? (
                        <div className="flex flex-col gap-1">
                          <Link href={`/issues/${r.issueId}`} className="line-clamp-1 text-body text-foreground hover:underline">
                            {r.issueTitle}
                          </Link>
                          {r.issueStatus ? <StatusBadge status={r.issueStatus} /> : null}
                        </div>
                      ) : (
                        <Badge variant="default">{t("signals.unlinkedBadge")}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pager page={result.page} pageSize={result.pageSize} total={result.total} href={(p) => hrefFor(view, p)} />
          </CardContent>
        </Card>
      )}
      {drawer}
    </>
  );
}
