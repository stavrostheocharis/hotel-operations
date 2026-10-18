import { InboxIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { requireViewer } from "@/auth/viewer";
import { EmptyState } from "@/components/console/empty-state";
import { PageHeader } from "@/components/console/page-header";
import { PageSkeleton } from "@/components/console/page-skeleton";
import { RelativeTime } from "@/components/console/relative-time";
import { RunJobButton } from "@/components/imports/batch-tools";
import { JOB_VARIANT, recordsAdded, stageVariant, verdictVariant } from "@/components/imports/stage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtBytes, fmtDateTime } from "@/console/format";
import { lastImport, listBatches } from "@/console/imports";
import { getAppDb } from "@/db";
import { label, t } from "@/i18n";
import { latestJobs } from "@/jobs/queries";
import type { JobView } from "@/jobs/types";
import { canSee } from "@/auth/screens";
import { NotAllowed } from "@/components/console/not-allowed";

export const metadata = { title: t("imports.title") };

/** "Did the latest export get in, and what did it find?" */
export default function ImportsPage() {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<PageSkeleton variant="table" />}>
        <Content />
      </Suspense>
    </div>
  );
}

async function Content() {
  const viewer = await requireViewer();
  if (!canSee(viewer.roleAt(), "imports")) return <NotAllowed />;
  const db = getAppDb();
  const [batches, last, jobs] = await Promise.all([listBatches(db, viewer.scoped), lastImport(db, viewer.scoped), latestJobs(db, viewer.scoped)]);
  const tz = viewer.property.timezone;
  const now = new Date();
  const canImport = viewer.can("imports.run");
  const canRun = viewer.can("jobs.run");
  return (
    <>
      <PageHeader
        title={t("imports.title")}
        description={t("imports.question")}
        badge={last ? <span className="text-caption text-muted-foreground">{t("imports.lastImport", { when: fmtDateTime(last, tz) })}</span> : null}
        actions={
          <>
            {canRun ? <RunJobButton kind="link" label={t("imports.runLinking")} /> : null}
            {canImport ? <Button render={<Link href="/imports/new" />}>{t("imports.newImport")}</Button> : null}
          </>
        }
      />
      {batches.length === 0 ? (
        <EmptyState icon={<InboxIcon />} title={t("imports.noImport")} body={t("imports.empty")} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("imports.columns.started")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("imports.columns.files")}</TableHead>
                  <TableHead>{t("imports.columns.stage")}</TableHead>
                  <TableHead>{t("imports.columns.verdict")}</TableHead>
                  <TableHead className="text-right">{t("imports.columns.records")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("imports.columns.by")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((b) => {
                  const added = recordsAdded(b);
                  return (
                    <TableRow key={b.id}>
                      <TableCell>
                        <Link href={`/imports/${b.id}`} className="text-body-strong text-foreground hover:underline focus-visible:shadow-focus focus-visible:outline-none">
                          {fmtDateTime(b.createdAt, tz)}
                        </Link>
                        <div className="text-caption text-muted-foreground">{b.source === "folder" ? (b.dir.split("/").filter(Boolean).at(-1) ?? "") : t("imports.upload.title")}</div>
                      </TableCell>
                      <TableCell className="hidden text-body text-muted-foreground md:table-cell">{t("imports.batch.files", { n: b.files.length, size: fmtBytes(b.bytes) })}</TableCell>
                      <TableCell>
                        <Badge variant={stageVariant(b.status)}>{label("imports.stage", b.status)}</Badge>
                      </TableCell>
                      <TableCell>{b.verdict ? <Badge variant={verdictVariant(b.verdict)}>{label("imports.verdict", b.verdict)}</Badge> : <span className="text-muted-foreground">–</span>}</TableCell>
                      <TableCell className="text-right tabular-nums">{added === null ? <span className="text-muted-foreground">–</span> : added.toLocaleString("en-GB")}</TableCell>
                      <TableCell className="hidden text-body md:table-cell">{b.createdByName ?? "–"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{t("imports.recentJobs")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {Object.keys(jobs).length === 0 ? (
            <p className="px-6 pb-6 text-body text-muted-foreground">{t("jobs.none")}</p>
          ) : (
            <Table>
              <TableBody>
                {(Object.values(jobs) as JobView[])
                  .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
                  .map((j) => (
                    <TableRow key={j.id}>
                      <TableCell className="text-body text-foreground capitalize">{label("jobs.kind", j.kind)}</TableCell>
                      <TableCell>
                        <Badge variant={JOB_VARIANT[j.status]}>{label("jobs.status", j.status)}</Badge>
                        {j.stalled ? <span className="ml-2 text-caption text-critical">{t("jobs.stalled")}</span> : null}
                      </TableCell>
                      <TableCell className="text-caption text-muted-foreground">
                        {j.finishedAt ? (
                          <>
                            {t("jobs.finished", { when: "" })}
                            <RelativeTime at={j.finishedAt} now={now} timeZone={tz} />
                          </>
                        ) : j.startedAt ? (
                          <>
                            {t("jobs.started", { when: "" })}
                            <RelativeTime at={j.startedAt} now={now} timeZone={tz} />
                          </>
                        ) : (
                          label("jobs.status", "queued")
                        )}
                      </TableCell>
                      <TableCell className="hidden text-caption text-muted-foreground md:table-cell">{j.requestedByName ? t("jobs.by", { name: j.requestedByName }) : "–"}</TableCell>
                      <TableCell className="whitespace-normal text-caption text-critical">{j.error ?? ""}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
