import { CircleCheckIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { requireViewer } from "@/auth/viewer";
import { EmptyState } from "@/components/console/empty-state";
import { PageHeader } from "@/components/console/page-header";
import { PageSkeleton } from "@/components/console/page-skeleton";
import { AddLocationDialog, AliasEditor, MapSpelling, RenameDialog, ServesDialog, type PlaceOption } from "@/components/settings/location-tools";
import { SettingsTabs, visibleSettingsTabs } from "@/components/settings/settings-tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate } from "@/console/format";
import { getLocationTree, listUnresolvedSpellings, type TreeNode } from "@/console/locations";
import { getAppDb } from "@/db";
import { label, t } from "@/i18n";
import { cn } from "@/lib/utils";
import { canSee } from "@/auth/screens";
import { NotAllowed } from "@/components/console/not-allowed";

export const metadata = { title: t("settings.tabs.locations") };

const KINDS = ["building", "floor", "room", "facility", "equipment", "unresolved"] as const;
type Kind = (typeof KINDS)[number];

/** Which places exist, what they are also called, what serves what, and the spellings nothing resolved. */
export default function SettingsLocationsPage(props: PageProps<"/settings/locations">) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("settings.title")} description={t("settings.locations.question")} />
      <Suspense fallback={<PageSkeleton variant="table" header={false} />}>
        <Body searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

async function Body({ searchParams }: Pick<PageProps<"/settings/locations">, "searchParams">) {
  const sp = await searchParams;
  const kind = (KINDS.includes(one(sp.kind) as Kind) ? one(sp.kind) : "room") as Kind;
  const q = (one(sp.q) ?? "").trim().toLowerCase();
  const viewer = await requireViewer();
  if (!canSee(viewer.roleAt(), "settings")) return <NotAllowed />;
  const db = getAppDb();
  const canEdit = viewer.can("settings.locations");
  const tree = await getLocationTree(db, viewer.scoped);
  const all = [...tree.byId.values()];
  const places: PlaceOption[] = all.filter((n) => n.kind !== "property").map((n) => ({ id: n.id, code: n.code, name: n.name, kind: n.kind }));
  const parents: PlaceOption[] = all.map((n) => ({ id: n.id, code: n.code, name: n.name, kind: n.kind }));
  const nameOf = new Map(all.map((n) => [n.id, n.name]));
  const rows = all.filter((n) => n.kind === kind && (!q || n.code.toLowerCase().includes(q) || n.name.toLowerCase().includes(q)));
  const spellings = kind === "unresolved" ? await listUnresolvedSpellings(db, viewer.scoped) : [];
  const tz = viewer.property.timezone;

  return (
    <>
      <SettingsTabs active="locations" visible={visibleSettingsTabs(viewer)} />
      <div className="flex flex-wrap items-center gap-2">
        {KINDS.map((k) => (
          <Link
            key={k}
            href={`/settings/locations?kind=${k}`}
            aria-current={k === kind ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1.5 text-caption-lg font-medium transition-colors focus-visible:shadow-focus focus-visible:outline-none",
              k === kind ? "border-primary bg-primary-soft text-primary" : "border-transparent bg-secondary text-foreground hover:bg-surface-hover",
            )}
          >
            {k === "unresolved" ? `${t("settings.locations.unresolved")}` : `${label("locations.kind", k)} · ${all.filter((n) => n.kind === k).length}`}
          </Link>
        ))}
        {canEdit ? (
          <div className="ml-auto">
            <AddLocationDialog parents={parents} />
          </div>
        ) : null}
      </div>

      {kind === "unresolved" ? (
        spellings.length === 0 ? (
          <EmptyState icon={<CircleCheckIcon />} title={t("settings.locations.unresolvedEmpty")} />
        ) : (
          <Card>
            <CardContent className="flex flex-col gap-3 p-0">
              <p className="px-4 pt-4 text-body text-muted-foreground">{t("settings.locations.unresolvedLead")}</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("settings.locations.spelling")}</TableHead>
                    <TableHead className="text-right">{t("settings.locations.records")}</TableHead>
                    <TableHead className="hidden md:table-cell">{t("settings.locations.sample")}</TableHead>
                    <TableHead className="w-32" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {spellings.map((s) => (
                    <TableRow key={s.typed}>
                      <TableCell className="whitespace-normal">
                        <span className="text-body-strong text-foreground">{s.typed}</span>
                        <div className="text-caption text-muted-foreground">
                          {s.sources.map((x) => label("source", x)).join(", ")} · {fmtDate(s.lastAt, tz)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{s.count}</TableCell>
                      <TableCell className="hidden max-w-md whitespace-normal text-caption text-muted-foreground md:table-cell">{s.sample}</TableCell>
                      <TableCell className="text-right">{canEdit ? <MapSpelling spelling={s.typed} places={places} /> : null}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("settings.locations.columns.code")}</TableHead>
                  <TableHead>{t("settings.locations.columns.name")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("settings.locations.columns.parent")}</TableHead>
                  <TableHead>{t("settings.locations.columns.aliases")}</TableHead>
                  {kind === "equipment" ? <TableHead>{t("settings.locations.columns.serves")}</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((n: TreeNode) => (
                  <TableRow key={n.id}>
                    <TableCell>
                      <Link href={`/locations/${encodeURIComponent(n.code)}`} className="text-body-strong text-foreground hover:underline focus-visible:shadow-focus focus-visible:outline-none">
                        {n.code}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      {n.name}
                      {canEdit && n.kind !== "property" ? <RenameDialog locationId={n.id} name={n.name} /> : null}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{n.parentId ? (nameOf.get(n.parentId) ?? "–") : "–"}</TableCell>
                    <TableCell className="whitespace-normal">
                      {canEdit ? <AliasEditor locationId={n.id} aliases={n.aliases} /> : <span className="text-caption text-muted-foreground">{n.aliases.join(" · ")}</span>}
                    </TableCell>
                    {kind === "equipment" ? (
                      <TableCell className="whitespace-normal">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {n.serves.map((c) => (
                            <Badge key={c} variant="outline">
                              {c}
                            </Badge>
                          ))}
                          {canEdit ? <ServesDialog equipmentId={n.id} equipmentName={n.name} places={places} current={all.filter((x) => n.serves.includes(x.code)).map((x) => x.id)} /> : null}
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
