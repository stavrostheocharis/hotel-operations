import { requireViewer } from "@/auth/viewer";
import { getBatch } from "@/console/imports";
import { getAppDb } from "@/db";
import { renderMemo } from "@/reality";

/** The reality-check memo of a batch, as the Markdown file the CLI writes. */
export async function GET(_request: Request, ctx: { params: Promise<{ batchId: string }> }) {
  const viewer = await requireViewer();
  const { batchId } = await ctx.params;
  const batch = await getBatch(getAppDb(), viewer.scoped, batchId);
  if (!batch?.report) return new Response("not found", { status: 404 });
  return new Response(renderMemo(batch.report), {
    headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="reality-check-${batchId.slice(0, 8)}.md"`, "cache-control": "no-store" },
  });
}
