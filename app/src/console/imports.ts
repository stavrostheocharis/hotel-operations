import { sql } from "drizzle-orm";
import { withTenant, type Db, type TenantContext } from "@/db";
import type { ImportMapping } from "@/import/mapping";
import type { LoadResult } from "@/import/loader";
import type { RealityReport } from "@/reality/types";

/** Reads for the Imports list and the batch page. */
export type BatchRow = {
  id: string;
  source: string;
  dir: string;
  files: { name: string; bytes: number }[];
  bytes: number;
  status: string;
  verdict: string | null;
  counts: LoadResult | null;
  jobId: string | null;
  error: string | null;
  createdByName: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type BatchDetail = BatchRow & { report: RealityReport | null; mapping: ImportMapping | null };

type Raw = {
  id: string;
  source: string;
  dir: string;
  files: { name: string; bytes: number }[];
  bytes: number | string;
  status: string;
  verdict: string | null;
  counts: Record<string, unknown>;
  job_id: string | null;
  error: string | null;
  created_by_name: string | null;
  created_at: Date;
  updated_at: Date;
  reality_report?: Record<string, unknown>;
  mapping?: Record<string, unknown>;
};

const toRow = (r: Raw): BatchRow => ({
  id: r.id,
  source: r.source,
  dir: r.dir,
  files: Array.isArray(r.files) ? r.files : [],
  bytes: Number(r.bytes),
  status: r.status,
  verdict: r.verdict,
  counts: r.counts && Object.keys(r.counts).length ? (r.counts as unknown as LoadResult) : null,
  jobId: r.job_id,
  error: r.error,
  createdByName: r.created_by_name,
  createdAt: new Date(r.created_at),
  updatedAt: new Date(r.updated_at),
});

export async function listBatches(db: Db, ctx: TenantContext, limit = 30): Promise<BatchRow[]> {
  return withTenant(db, ctx, async (tx) => {
    const rows = await tx.execute<Raw>(sql`
      select b.id, b.source::text as source, b.dir, b.files, b.bytes, b.status::text as status, b.verdict, b.counts, b.job_id, b.error,
             u.name as created_by_name, b.created_at, b.updated_at
      from import_batches b left join users u on u.id = b.created_by
      order by b.created_at desc limit ${limit}
    `);
    return rows.map(toRow);
  });
}

export async function getBatch(db: Db, ctx: TenantContext, id: string): Promise<BatchDetail | null> {
  return withTenant(db, ctx, async (tx) => {
    const [r] = await tx.execute<Raw>(sql`
      select b.id, b.source::text as source, b.dir, b.files, b.bytes, b.status::text as status, b.verdict, b.counts, b.job_id, b.error,
             u.name as created_by_name, b.created_at, b.updated_at, b.reality_report, b.mapping
      from import_batches b left join users u on u.id = b.created_by
      where b.id = ${id}
    `);
    if (!r) return null;
    return {
      ...toRow(r),
      report: r.reality_report && Object.keys(r.reality_report).length ? (r.reality_report as unknown as RealityReport) : null,
      mapping: r.mapping && Object.keys(r.mapping).length ? (r.mapping as unknown as ImportMapping) : null,
    };
  });
}

/** When the last import finished, for the Imports header. */
export async function lastImport(db: Db, ctx: TenantContext): Promise<Date | null> {
  return withTenant(db, ctx, async (tx) => {
    const [r] = await tx.execute<{ at: Date | null }>(sql`select max(occurred_at) as at from events where type = 'ingest.completed'`);
    return r?.at ? new Date(r.at) : null;
  });
}
