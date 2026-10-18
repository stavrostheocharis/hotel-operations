import { requireViewer } from "@/auth/viewer";
import { getAppDb } from "@/db";
import { getJob } from "@/jobs/queries";

/** The page polls this while a job is queued or running. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  const { id } = await ctx.params;
  const job = await getJob(getAppDb(), viewer.tenant, id);
  if (!job) return new Response("not found", { status: 404, headers: { "cache-control": "no-store" } });
  return Response.json(
    { id: job.id, kind: job.kind, status: job.status, progress: job.progress, log: job.log.slice(-40), error: job.error, result: job.result, stalled: job.stalled, finishedAt: job.finishedAt, heartbeatAt: job.heartbeatAt },
    { headers: { "cache-control": "no-store" } },
  );
}
