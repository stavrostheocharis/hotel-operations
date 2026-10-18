"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

import { useActionToast } from "@/components/console/use-action-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { markStalledAction } from "@/console/import-actions";
import type { ActionResult } from "@/console/issue-actions";
import type { JobProgressInfo } from "@/jobs/types";
import { label, t } from "@/i18n";

type Snapshot = {
  status: string;
  progress: JobProgressInfo | null;
  log: { at: string; line: string }[];
  error: string | null;
  stalled: boolean;
  /** Queued for so long that no worker seems to be running (decided server-side). */
  noWorker: boolean;
};

/**
 * Follows a job while it is queued or running (one poll every two seconds),
 * then refreshes the page once so the server-rendered result shows.
 */
export function JobProgress({ jobId, initial, canManage }: { jobId: string; initial: Snapshot; canManage: boolean }) {
  const [snap, setSnap] = useState<Snapshot>(initial);
  const router = useRouter();
  const refreshed = useRef(false);
  const active = snap.status === "queued" || snap.status === "running";
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as Snapshot;
        if (cancelled) return;
        setSnap(next);
        if (next.status !== "queued" && next.status !== "running" && !refreshed.current) {
          refreshed.current = true;
          router.refresh();
        }
      } catch {
        // the next tick tries again
      }
    };
    const h = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(h);
    };
  }, [jobId, active, router]);
  const pct = snap.progress && snap.progress.total ? Math.round((100 * snap.progress.done) / snap.progress.total) : null;
  return (
    <div className="flex flex-col gap-3 rounded-card bg-secondary p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={snap.status === "succeeded" ? "success" : snap.status === "failed" ? "critical" : snap.status === "running" ? "info" : "default"}>{label("jobs.status", snap.status)}</Badge>
        {snap.progress ? (
          <span className="text-body text-foreground">
            {label("jobs.step", snap.progress.step)}
            {snap.progress.message ? ` · ${snap.progress.message}` : ""}
          </span>
        ) : null}
        {snap.stalled ? <span className="text-caption text-critical">{t("jobs.stalled")}</span> : null}
        {snap.noWorker ? <span className="text-caption text-warning">{t("jobs.noWorker")}</span> : null}
        {snap.stalled && canManage ? <MarkStalled jobId={jobId} /> : null}
      </div>
      {pct !== null && active ? <Progress value={pct} /> : null}
      {snap.error ? <p className="text-body text-critical">{snap.error}</p> : null}
      {snap.log.length ? (
        <pre className="max-h-48 overflow-auto rounded-lg bg-background p-3 text-caption text-muted-foreground">{snap.log.slice(-15).map((l) => l.line).join("\n")}</pre>
      ) : null}
    </div>
  );
}

function MarkStalled({ jobId }: { jobId: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(markStalledAction, null);
  useActionToast(state);
  return (
    <form action={action}>
      <input type="hidden" name="jobId" value={jobId} />
      <Button type="submit" variant="ghost" disabled={pending}>
        {t("jobs.markFailed")}
      </Button>
    </form>
  );
}
