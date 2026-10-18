"use server";

import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { assertCan } from "@/auth/permissions";
import { requireViewer } from "@/auth/viewer";
import { getAppDb, schema, withTenant } from "@/db";
import { demoFolder, uploadsDir } from "@/db/scripts/lib/paths";
import { mappingFromReport } from "@/import/mapping";
import { t } from "@/i18n";
import { enqueueJob } from "@/jobs/runner";
import { markStalled } from "@/jobs/run";
import { runRealityCheck } from "@/reality";
import type { ActionResult } from "./issue-actions";
import { failureMessage } from "./action-errors";

/**
 * The import wizard's steps and the job buttons. Every action
 * re-authenticates and checks `imports.run` / `jobs.run`; long work goes to
 * the detached worker, the reality check (a second or two) runs inline.
 */
const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};

async function run(fn: () => Promise<string>): Promise<ActionResult> {
  try {
    const message = await fn();
    refresh();
    return { ok: true, message, at: Date.now() };
  } catch (err) {
    return { ok: false, message: failureMessage(err), at: Date.now() };
  }
}

/** A folder must be the server's exports folder or sit inside the uploads folder. */
async function safeFolder(dir: string): Promise<string> {
  const abs = path.resolve(dir);
  const demo = demoFolder();
  const roots = [...(demo ? [path.resolve(demo)] : []), path.resolve(uploadsDir())];
  if (!roots.some((r) => abs === r || abs.startsWith(r + path.sep))) throw new Error(t("imports.errors.folderOutside"));
  const s = await stat(abs).catch(() => null);
  if (!s?.isDirectory()) throw new Error(t("imports.errors.folderMissing"));
  return abs;
}

/** "Import from server folder": the demo season, or a folder an admin placed under data/. */
export async function createFolderBatchAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const viewer = await requireViewer();
  let id: string | null = null;
  const res = await run(async () => {
    assertCan(viewer.actor(), "imports.run");
    const dir = await safeFolder(str(fd, "dir") || demoFolder() || "");
    const names = (await readdir(dir, { withFileTypes: true })).filter((e) => e.isFile() && !e.name.startsWith(".")).map((e) => e.name);
    const files: { name: string; bytes: number }[] = [];
    for (const name of names) files.push({ name, bytes: (await stat(path.join(dir, name))).size });
    const [row] = await withTenant(getAppDb(), viewer.scoped, (tx) =>
      tx
        .insert(schema.importBatches)
        .values({ groupId: viewer.scoped.groupId, propertyId: viewer.property.id, source: "folder", dir, files, bytes: files.reduce((n, f) => n + f.bytes, 0), createdBy: viewer.user.id })
        .returning({ id: schema.importBatches.id }),
    );
    id = row.id;
    await withTenant(getAppDb(), viewer.scoped, (tx) =>
      tx.insert(schema.events).values({ groupId: viewer.scoped.groupId, propertyId: viewer.property.id, entityType: "import", entityId: row.id, type: "import.created", actor: viewer.user.id, payload: { source: "folder", files: files.length } }),
    );
    return t("imports.toast.created", { n: files.length });
  });
  if (res.ok && id) redirect(`/imports/${id}`);
  return res;
}

export async function checkBatchAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    assertCan(viewer.actor(), "imports.run");
    const batchId = str(fd, "batchId");
    const [batch] = await withTenant(getAppDb(), viewer.scoped, (tx) => tx.select().from(schema.importBatches).where(eq(schema.importBatches.id, batchId)));
    if (!batch) throw new Error("batch not found");
    const dir = await safeFolder(batch.dir);
    const { report } = await runRealityCheck(dir);
    const mapping = mappingFromReport(report);
    await withTenant(getAppDb(), viewer.scoped, async (tx) => {
      await tx
        .update(schema.importBatches)
        .set({ status: "checked", verdict: report.decision.verdict, realityReport: report as unknown as Record<string, unknown>, mapping: mapping as unknown as Record<string, unknown>, error: null })
        .where(eq(schema.importBatches.id, batch.id));
      await tx.insert(schema.events).values({ groupId: batch.groupId, propertyId: batch.propertyId, entityType: "import", entityId: batch.id, type: "import.checked", actor: viewer.user.id, payload: { verdict: report.decision.verdict, datasets: mapping.files.length } });
    });
    return t("imports.toast.checked", { verdict: report.decision.verdict.toUpperCase() });
  });
}

export async function loadBatchAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    assertCan(viewer.actor(), "imports.run");
    const batchId = str(fd, "batchId");
    const [batch] = await withTenant(getAppDb(), viewer.scoped, (tx) => tx.select().from(schema.importBatches).where(eq(schema.importBatches.id, batchId)));
    if (!batch) throw new Error("batch not found");
    if (batch.status !== "checked" && batch.status !== "failed" && batch.status !== "loaded") throw new Error(t("imports.errors.notChecked"));
    if (batch.verdict === "stop" && !viewer.can("imports.override")) throw new Error(t("imports.errors.stop"));
    // The batch is marked before the job exists, so a fast worker's own writes always come later.
    await withTenant(getAppDb(), viewer.scoped, (tx) => tx.update(schema.importBatches).set({ status: "loading", error: null }).where(eq(schema.importBatches.id, batch.id)));
    const { id } = await enqueueJob(getAppDb(), viewer.scoped, { propertyId: viewer.property.id, kind: "import", params: { batchId: batch.id, propertyCode: viewer.property.code, llm: str(fd, "llm") === "on" }, requestedBy: viewer.user.id }).catch(async (err) => {
      await withTenant(getAppDb(), viewer.scoped, (tx) => tx.update(schema.importBatches).set({ status: batch.status }).where(eq(schema.importBatches.id, batch.id)));
      throw err;
    });
    await withTenant(getAppDb(), viewer.scoped, (tx) => tx.update(schema.importBatches).set({ jobId: id }).where(eq(schema.importBatches.id, batch.id)));
    return t("imports.toast.loading");
  });
}

export async function discardBatchAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    assertCan(viewer.actor(), "imports.run");
    const batchId = str(fd, "batchId");
    await withTenant(getAppDb(), viewer.scoped, (tx) => tx.update(schema.importBatches).set({ status: "discarded" }).where(eq(schema.importBatches.id, batchId)));
    return t("imports.toast.discarded");
  });
}

export async function runJobAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    assertCan(viewer.actor(), "jobs.run");
    const kind = str(fd, "kind");
    if (kind !== "link" && kind !== "normalize" && kind !== "embed") throw new Error("unknown job");
    await enqueueJob(getAppDb(), viewer.scoped, {
      propertyId: viewer.property.id,
      kind,
      params: { propertyCode: viewer.property.code, llm: str(fd, "llm") === "on", embed: str(fd, "embed") === "on", all: str(fd, "all") === "on" },
      requestedBy: viewer.user.id,
    });
    return t("jobs.toast.started", { kind: t(`jobs.kind.${kind}`) });
  });
}

export async function markStalledAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    assertCan(viewer.actor(), "jobs.run");
    const jobId = str(fd, "jobId");
    const done = await withTenant(getAppDb(), viewer.scoped, (tx) => markStalled(tx, jobId));
    return done ? t("jobs.toast.markedFailed") : t("jobs.toast.nothingToDo");
  });
}
