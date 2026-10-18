import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import { requireViewer } from "@/auth/viewer";
import { getAppDb, schema, withTenant } from "@/db";
import { uploadsDir } from "@/db/scripts/lib/paths";
import { t } from "@/i18n";

/**
 * POST multipart/form-data with `files`: a client's exports, as delivered.
 * Lands in uploads/<batch>/ and creates the import batch; the page then
 * runs the reality check on it. Server actions cap bodies at 1 MB, hence a
 * route handler. Limits: 50 files, 100 MB each, 300 MB per batch.
 */
const MAX_FILES = 50;
const MAX_FILE = 100 * 1024 * 1024;
const MAX_BATCH = 300 * 1024 * 1024;
const ALLOWED = /\.(csv|tsv|txt|xlsx|xlsm|xls|json|jsonl|ndjson|pdf|docx)$/i;

export async function POST(request: Request) {
  const viewer = await requireViewer();
  if (!viewer.can("imports.run")) return Response.json({ error: t("common.notAllowed") }, { status: 403 });
  const form = await request.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return Response.json({ error: t("imports.upload.none") }, { status: 400 });
  if (files.length > MAX_FILES) return Response.json({ error: t("imports.errors.tooMany") }, { status: 400 });
  if (files.some((f) => f.size > MAX_FILE)) return Response.json({ error: t("imports.errors.tooBig") }, { status: 400 });
  const total = files.reduce((n, f) => n + f.size, 0);
  if (total > MAX_BATCH) return Response.json({ error: t("imports.errors.tooBig") }, { status: 400 });
  if (files.some((f) => !ALLOWED.test(f.name))) return Response.json({ error: t("imports.errors.kind") }, { status: 400 });

  const batchId = randomUUID();
  const dir = path.join(uploadsDir(), batchId);
  await mkdir(dir, { recursive: true });
  const stored: { name: string; bytes: number }[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    let name = safeName(f.name);
    let i = 1;
    while (seen.has(name)) name = safeName(f.name).replace(/(\.[^.]+)$/, `-${++i}$1`);
    seen.add(name);
    await pipeline(Readable.fromWeb(f.stream() as never), createWriteStream(path.join(dir, name)));
    stored.push({ name, bytes: f.size });
  }
  await withTenant(getAppDb(), viewer.scoped, async (tx) => {
    await tx.insert(schema.importBatches).values({ id: batchId, groupId: viewer.scoped.groupId, propertyId: viewer.property.id, source: "upload", dir, files: stored, bytes: total, createdBy: viewer.user.id });
    await tx.insert(schema.events).values({ groupId: viewer.scoped.groupId, propertyId: viewer.property.id, entityType: "import", entityId: batchId, type: "import.uploaded", actor: viewer.user.id, payload: { files: stored.length, bytes: total } });
  });
  return Response.json({ batchId }, { headers: { "cache-control": "no-store" } });
}

/** Basename only, NFC, no separators or control characters. */
export function safeName(name: string): string {
  const base = path.basename(name).normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim();
  return base.slice(0, 120) || "file";
}
