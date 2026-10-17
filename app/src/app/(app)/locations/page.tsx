import Link from "next/link";
import { Suspense } from "react";

import { requireViewer } from "@/auth/viewer";
import { PageHeader } from "@/components/console/page-header";
import { PageSkeleton } from "@/components/console/page-skeleton";
import { LocationBrowser } from "@/components/locations/browser";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getLocationTree } from "@/console/locations";
import { getAppDb } from "@/db";
import { t } from "@/i18n";

export const metadata = { title: t("locations.title") };

/** "Where are the problems?" The tree, and the property's buildings at a glance. */
export default function LocationsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("locations.title")} description={t("locations.overview.lead")} />
      <Suspense fallback={<PageSkeleton variant="detail" />}>
        <Overview />
      </Suspense>
    </div>
  );
}

async function Overview() {
  const viewer = await requireViewer();
  const tree = await getLocationTree(getAppDb(), viewer.scoped);
  return (
    <LocationBrowser tree={tree} selectedCode={null}>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("locations.overview.columns.building")}</TableHead>
                <TableHead className="text-right">{t("locations.overview.columns.open")}</TableHead>
                <TableHead className="text-right">{t("locations.overview.columns.recurring")}</TableHead>
                <TableHead className="text-right">{t("locations.overview.columns.total")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...tree.buildings, ...tree.facilities, ...tree.equipment.filter((e) => e.below.open > 0)].map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <Link href={`/locations/${encodeURIComponent(b.code)}`} className="text-body-strong text-foreground hover:underline focus-visible:shadow-focus focus-visible:outline-none">
                      {b.name}
                    </Link>
                    <span className="ml-2 text-caption text-muted-foreground">
                      {b.code} · {t(`locations.kind.${b.kind as "building"}`)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{b.below.open}</TableCell>
                  <TableCell className="text-right tabular-nums">{b.below.recurring}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{b.below.total}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </LocationBrowser>
  );
}
