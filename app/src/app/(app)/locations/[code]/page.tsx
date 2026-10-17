import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { requireViewer } from "@/auth/viewer";
import { SourceBadge, StatusBadge } from "@/components/console/badges";
import { PageHeader } from "@/components/console/page-header";
import { PageSkeleton } from "@/components/console/page-skeleton";
import { Pager } from "@/components/console/pager";
import { ViewTabs } from "@/components/console/view-tabs";
import { LocationBrowser } from "@/components/locations/browser";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate, fmtDateTime } from "@/console/format";
import { getLocationByCode, getLocationTree, listIssuesAtLocation, listUnlinkedSignalsAtLocation } from "@/console/locations";
import { getAppDb } from "@/db";
import { label, t } from "@/i18n";
import { cn } from "@/lib/utils";

export const metadata = { title: t("locations.title") };

/** "What has happened at this place?" */
export default function LocationPage(props: PageProps<"/locations/[code]">) {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      <Place params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

async function Place({ params, searchParams }: Pick<PageProps<"/locations/[code]">, "params" | "searchParams">) {
  const { code } = await params;
  const sp = await searchParams;
  const tab = (["overview", "history", "rooms"].includes(one(sp.tab) ?? "") ? one(sp.tab) : "overview") as "overview" | "history" | "rooms";
  const below = one(sp.below) === "1";
  const page = Math.max(1, Number(one(sp.page) ?? 1) || 1);
  const viewer = await requireViewer();
  const db = getAppDb();
  const decoded = decodeURIComponent(code);
  const [tree, place] = await Promise.all([getLocationTree(db, viewer.scoped), getLocationByCode(db, viewer.scoped, decoded)]);
  if (!place) notFound();
  const tz = viewer.property.timezone;
  const ids = below ? place.descendantIds : [place.id];
  const [issues, loose] = tab === "history" ? await Promise.all([listIssuesAtLocation(db, viewer.scoped, { ids, page }), listUnlinkedSignalsAtLocation(db, viewer.scoped, ids)]) : [null, null];
  const base = `/locations/${encodeURIComponent(place.code)}`;
  const href = (tb: string, extra: Record<string, string | null> = {}) => {
    const u = new URLSearchParams();
    if (tb !== "overview") u.set("tab", tb);
    for (const [k, v] of Object.entries({ below: below ? "1" : null, ...extra })) if (v) u.set(k, v);
    const s = u.toString();
    return `${base}${s ? `?${s}` : ""}`;
  };
  const hasChildren = place.children.length > 0;
  const facts = Object.entries(place.attributes).filter(([k, v]) => v !== null && v !== "" && !["serves_unresolved", "serves_text"].includes(k) && typeof v !== "object");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[{ label: t("locations.title"), href: "/locations" }, ...place.chain.slice().reverse().map((c) => ({ label: c.name, href: `/locations/${encodeURIComponent(c.code)}` })), { label: place.name }]}
        title={place.name}
        badge={<Badge variant="default">{t(`locations.kind.${place.kind as "room"}`)}</Badge>}
        description={
          <>
            {place.code}
            {place.below.open ? ` · ${t("locations.place.openBelow", { n: place.below.open })}` : ""}
            {place.below.recurring ? ` · ${t("locations.place.recurringBelow", { n: place.below.recurring })}` : ""}
          </>
        }
        actions={viewer.can("settings.locations") ? <Button variant="secondary" render={<Link href={`/settings/locations?kind=${place.kind}&q=${encodeURIComponent(place.code)}`} />}>{t("locations.place.editInSettings")}</Button> : null}
      />
      <LocationBrowser tree={tree} selectedCode={place.code}>
        <div className="flex flex-col gap-4">
          <ViewTabs
            active={tab}
            tabs={[
              { key: "overview", label: t("locations.place.tabs.overview"), href: href("overview") },
              { key: "history", label: t("locations.place.tabs.history"), count: place.below.total, href: href("history") },
              ...(hasChildren ? [{ key: "rooms", label: t("locations.place.tabs.rooms"), count: place.children.length, href: href("rooms") }] : []),
            ]}
          />

          {tab === "overview" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardContent className="flex flex-col gap-2">
                  <h2 className="text-title-sm text-foreground">{t("locations.place.attributes")}</h2>
                  {facts.length ? (
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body">
                      {facts.map(([k, v]) => (
                        <div key={k} className="contents">
                          <dt className="text-caption text-muted-foreground">{k.replace(/_/g, " ")}</dt>
                          <dd className="text-foreground">{String(v)}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="text-body text-muted-foreground">–</p>
                  )}
                  <h2 className="mt-3 text-title-sm text-foreground">{t("locations.place.aliases")}</h2>
                  <p className="text-body text-muted-foreground">{place.aliases.length ? place.aliases.join(" · ") : "–"}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex flex-col gap-3">
                  {place.kind === "equipment" ? (
                    <>
                      <h2 className="text-title-sm text-foreground">{t("locations.place.serves")}</h2>
                      <PlaceList items={place.serves} empty={t("locations.place.nothingServes")} />
                    </>
                  ) : null}
                  <h2 className="text-title-sm text-foreground">{t("locations.place.servedBy")}</h2>
                  <PlaceList items={place.servedBy} empty={t("locations.place.nothingServes")} />
                  <h2 className="mt-2 text-title-sm text-foreground">{t("locations.place.issuesHere")}</h2>
                  <p className="text-body text-foreground">
                    {place.counts.open} {t("locations.open")} · {place.counts.recurring} {t("locations.recurring")} · {place.counts.total} {t("locations.overview.columns.total").toLowerCase()}
                  </p>
                </CardContent>
              </Card>
            </div>
          ) : null}

          {tab === "history" && issues && loose ? (
            <div className="flex flex-col gap-4">
              {hasChildren ? (
                <div className="flex gap-2">
                  <Chip href={href("history", { below: null })} active={!below}>
                    {place.name}
                  </Chip>
                  <Chip href={href("history", { below: "1" })} active={below}>
                    {t("locations.place.includeBelow")}
                  </Chip>
                </div>
              ) : null}
              <Card>
                <CardContent className="p-0">
                  {issues.rows.length === 0 ? (
                    <p className="px-4 py-8 text-center text-body text-muted-foreground">{t("locations.place.noIssues")}</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("exceptions.columns.issue")}</TableHead>
                          <TableHead>{t("exceptions.columns.status")}</TableHead>
                          <TableHead className="hidden text-right md:table-cell">{t("exceptions.columns.signals")}</TableHead>
                          <TableHead className="hidden text-right lg:table-cell">{t("exceptions.columns.period")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {issues.rows.map((i) => (
                          <TableRow key={i.id}>
                            <TableCell className="whitespace-normal">
                              <Link href={`/issues/${i.id}`} className="text-body-strong text-foreground hover:underline focus-visible:shadow-focus focus-visible:outline-none">
                                {i.title}
                              </Link>
                              <div className="text-caption text-muted-foreground">
                                {below && i.locationCode ? `${i.locationCode} · ` : ""}
                                {i.category?.replace(/_/g, " ") ?? "unclassified"}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <StatusBadge status={i.status} />
                                {i.reopenCount > 0 ? <Badge variant="critical">{t("exceptions.row.back", { n: i.reopenCount })}</Badge> : null}
                              </div>
                            </TableCell>
                            <TableCell className="hidden text-right tabular-nums md:table-cell">{i.signals}</TableCell>
                            <TableCell className="hidden text-right text-caption text-muted-foreground tabular-nums lg:table-cell">
                              {fmtDate(i.openedAt, tz)}
                              {i.lastAt ? ` → ${fmtDate(i.lastAt, tz)}` : ""}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                  <Pager page={issues.page} pageSize={issues.pageSize} total={issues.total} href={(p) => href("history", { page: p > 1 ? String(p) : null })} />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex flex-col gap-2">
                  <h2 className="text-title-sm text-foreground">
                    {t("locations.place.loose")} · {loose.total}
                  </h2>
                  {loose.rows.length === 0 ? (
                    <p className="text-body text-muted-foreground">{t("locations.place.noLoose")}</p>
                  ) : (
                    <ul className="flex flex-col divide-y divide-border">
                      {loose.rows.map((s) => (
                        <li key={s.id} className="flex flex-col gap-0.5 py-2">
                          <div className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
                            <SourceBadge source={s.source} />
                            <span>{fmtDateTime(s.occurredAt, tz)}</span>
                            {below && s.locationCode ? <span>{s.locationCode}</span> : null}
                            <span>{(s.topic ?? s.category ?? "").replace(/_/g, " ")}</span>
                          </div>
                          <Link href={`/signals?record=${s.id}`} className="line-clamp-2 text-body text-foreground hover:underline">
                            {s.text ?? "–"}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : null}

          {tab === "rooms" ? (
            <Card>
              <CardContent>
                <ul className="flex flex-wrap gap-2">
                  {place.children.map((c) => (
                    <li key={c.id}>
                      <Link
                        href={`/locations/${encodeURIComponent(c.code)}`}
                        className={cn("inline-flex items-center gap-1.5 rounded-full border border-transparent bg-secondary px-3 py-1.5 text-caption-lg transition-colors hover:bg-surface-hover focus-visible:shadow-focus focus-visible:outline-none", c.counts.open > 0 && "border-critical-border bg-critical-bg text-critical")}
                      >
                        {c.kind === "floor" ? c.name : c.code}
                        {c.counts.open > 0 ? <span className="tabular-nums">· {c.counts.open}</span> : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </LocationBrowser>
    </div>
  );
}

function PlaceList({ items, empty }: { items: { id: string; code: string; name: string; kind: string }[]; empty: string }) {
  if (!items.length) return <p className="text-body text-muted-foreground">{empty}</p>;
  return (
    <ul className="flex flex-col gap-1 text-body">
      {items.map((p) => (
        <li key={p.id}>
          <Link href={`/locations/${encodeURIComponent(p.code)}`} className="text-foreground hover:underline focus-visible:shadow-focus focus-visible:outline-none">
            {p.name}
          </Link>
          <span className="text-caption text-muted-foreground">
            {" "}
            · {p.code} · {label("locations.kind", p.kind)}
          </span>
        </li>
      ))}
    </ul>
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
