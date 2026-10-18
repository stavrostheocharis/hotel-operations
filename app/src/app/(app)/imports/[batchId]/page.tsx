import { DownloadIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { requireViewer } from "@/auth/viewer";
import { PageHeader } from "@/components/console/page-header";
import { PageSkeleton } from "@/components/console/page-skeleton";
import { CheckButton, DiscardButton, LoadButton } from "@/components/imports/batch-tools";
import { ReportSummary } from "@/components/imports/report-summary";
import { recordsAdded, recordsUpdated, stageVariant } from "@/components/imports/stage";
import { Steps, type StepKey } from "@/components/imports/steps";
import { JobProgress } from "@/components/jobs/job-progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtBytes, fmtDateTime } from "@/console/format";
import { getBatch, type BatchDetail } from "@/console/imports";
import { getAppDb } from "@/db";
import { label, t } from "@/i18n";
import { getJob } from "@/jobs/queries";
import type { JobView } from "@/jobs/types";
import { canSee } from "@/auth/screens";
import { NotAllowed } from "@/components/console/not-allowed";

export const metadata = { title: t("imports.batch.title") };

/** The wizard: Upload → Reality check → Load → Normalise & link, one batch. */
export default function BatchPage(props: PageProps<"/imports/[batchId]">) {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<PageSkeleton variant="detail" />}>
        <Batch params={props.params} />
      </Suspense>
    </div>
  );
}

function stepOf(batch: BatchDetail, job: JobView | null): { current: StepKey | "done"; failed: boolean } {
  switch (batch.status) {
    case "uploaded":
      return { current: "check", failed: false };
    case "checked":
      return { current: "load", failed: false };
    case "loading":
      return { current: "load", failed: false };
    case "failed":
      return { current: job?.progress?.step === "normalize" || job?.progress?.step === "link" ? "link" : "load", failed: true };
    case "loaded":
      return job && (job.status === "queued" || job.status === "running") ? { current: "link", failed: false } : job?.status === "failed" ? { current: "link", failed: true } : { current: "done", failed: false };
    default:
      return { current: "upload", failed: false };
  }
}

async function Batch({ params }: Pick<PageProps<"/imports/[batchId]">, "params">) {
  const { batchId } = await params;
  const viewer = await requireViewer();
  if (!canSee(viewer.roleAt(), "imports")) return <NotAllowed />;
  const db = getAppDb();
  const batch = await getBatch(db, viewer.scoped, batchId);
  if (!batch) notFound();
  const job = batch.jobId ? await getJob(db, viewer.scoped, batch.jobId) : null;
  const tz = viewer.property.timezone;
  const canImport = viewer.can("imports.run");
  const canManageJobs = viewer.can("jobs.run");
  const { current, failed } = stepOf(batch, job);
  const jobActive = job !== null && (job.status === "queued" || job.status === "running");
  const result = job?.status === "succeeded" ? (job.result as { issues?: number; forReview?: number; normalized?: number }) : null;
  const added = recordsAdded(batch);

  return (
    <>
      <PageHeader
        crumbs={[{ label: t("imports.title"), href: "/imports" }, { label: fmtDateTime(batch.createdAt, tz) }]}
        title={t("imports.batch.title")}
        badge={<Badge variant={stageVariant(batch.status)}>{label("imports.stage", batch.status)}</Badge>}
        description={
          <>
            {t("imports.batch.files", { n: batch.files.length, size: fmtBytes(batch.bytes) })}
            {batch.createdByName ? ` · ${t("jobs.by", { name: batch.createdByName })}` : ""}
            {batch.source === "folder" ? ` · ${batch.dir.split("/").filter(Boolean).at(-1) ?? ""}` : ""}
          </>
        }
        actions={
          canImport && batch.status !== "discarded" && !jobActive ? (
            <>
              {batch.status !== "loaded" ? <DiscardButton batchId={batch.id} /> : null}
              {batch.report ? (
                <Button variant="secondary" render={<a href={`/imports/${batch.id}/memo`} />}>
                  <DownloadIcon data-icon="inline-start" />
                  {t("imports.batch.memo")}
                </Button>
              ) : null}
              {batch.status === "uploaded" || batch.status === "checked" || batch.status === "failed" ? <CheckButton batchId={batch.id} again={batch.status !== "uploaded"} /> : null}
            </>
          ) : null
        }
      />
      <Steps current={current} failed={failed} />

      {batch.error ? <p className="text-body text-critical">{batch.error}</p> : null}

      {job ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-title-sm text-foreground">{current === "done" ? t("imports.steps.link") : label("jobs.kind", "import")}</h2>
          <JobProgress jobId={job.id} canManage={canManageJobs} initial={{ status: job.status, progress: job.progress, log: job.log.slice(-40), error: job.error, stalled: job.stalled, noWorker: job.noWorker }} />
        </section>
      ) : null}

      {result ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-body text-foreground">{t("imports.batch.done", { issues: result.issues ?? 0, review: result.forReview ?? 0 })}</p>
            <div className="flex gap-2">
              <Button variant="secondary" render={<Link href="/review" />}>
                {t("imports.batch.openReview")}
              </Button>
              <Button render={<Link href="/today" />}>{t("imports.batch.openToday")}</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {batch.counts ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("imports.batch.loaded")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("imports.loadedColumns.source")}</TableHead>
                  <TableHead className="text-right">{t("imports.loadedColumns.rows")}</TableHead>
                  <TableHead className="text-right">{t("imports.loadedColumns.inserted")}</TableHead>
                  <TableHead className="text-right">{t("imports.loadedColumns.updated")}</TableHead>
                  <TableHead className="text-right">{t("imports.loadedColumns.skipped")}</TableHead>
                  <TableHead className="hidden text-right md:table-cell">{t("imports.loadedColumns.located")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(batch.counts.sources).map(([source, s]) => (
                  <TableRow key={source}>
                    <TableCell className="text-body text-foreground">{label("source", source)}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.rows.toLocaleString("en-GB")}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.inserted.toLocaleString("en-GB")}</TableCell>
                    <TableCell className="text-right tabular-nums">{(s.updated ?? 0).toLocaleString("en-GB")}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{s.skipped.toLocaleString("en-GB")}</TableCell>
                    <TableCell className="hidden text-right tabular-nums text-muted-foreground md:table-cell">{s.located.toLocaleString("en-GB")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex flex-wrap gap-x-6 gap-y-1 px-6 py-4 text-caption text-muted-foreground">
              <span>{t("imports.batch.places", { created: batch.counts.locations.created, links: batch.counts.locations.links })}</span>
              {added !== null ? <span>{t("imports.columns.records")}: {added.toLocaleString("en-GB")}</span> : null}
              {recordsUpdated(batch) ? <span>{t("imports.loadedColumns.updated")}: {recordsUpdated(batch).toLocaleString("en-GB")}</span> : null}
              {batch.counts.skipped.map((s) => (
                <span key={s.path} className="text-warning">
                  {s.path}: {s.reason}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {batch.report && batch.status !== "loaded" ? (
        <>
          {canImport && (batch.status === "checked" || batch.status === "failed") && !jobActive ? (
            <Card>
              <CardContent>
                <LoadButton batchId={batch.id} verdict={batch.verdict} canOverride={viewer.can("imports.override")} modelAvailable={Boolean(process.env.OPENAI_API_KEY)} />
              </CardContent>
            </Card>
          ) : null}
          <ReportSummary report={batch.report} mapping={batch.mapping} />
        </>
      ) : null}

      {batch.status === "uploaded" || !batch.report ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("imports.columns.files")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableBody>
                {batch.files.map((f) => (
                  <TableRow key={f.name}>
                    <TableCell className="text-body text-foreground">{f.name}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{fmtBytes(f.bytes)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
