import { sql } from "drizzle-orm";
import { withTenant, type Db, type TenantContext } from "@/db";
import { NO_WORKER_MS, STALL_MS, type JobView } from "./types";

type Raw = {
  id: string;
  kind: JobView["kind"];
  status: JobView["status"];
  params: Record<string, unknown>;
  progress: Record<string, unknown>;
  log: { lines?: { at: string; line: string }[] };
  result: Record<string, unknown>;
  error: string | null;
  requested_by: string | null;
  requested_by_name: string | null;
  heartbeat_at: Date | null;
  started_at: Date | null;
  finished_at: Date | null;
  created_at: Date;
};

const SELECT = sql`
  select j.id, j.kind::text as kind, j.status::text as status, j.params, j.progress, j.log, j.result, j.error,
         j.requested_by, u.name as requested_by_name, j.heartbeat_at, j.started_at, j.finished_at, j.created_at
  from jobs j left join users u on u.id = j.requested_by`;

function toView(r: Raw, now: Date): JobView {
  const hb = r.heartbeat_at ? new Date(r.heartbeat_at) : null;
  const p = r.progress ?? {};
  return {
    id: r.id,
    kind: r.kind,
    status: r.status,
    params: r.params ?? {},
    progress: typeof p.step === "string" ? { step: String(p.step), done: Number(p.done ?? 0), total: Number(p.total ?? 0), message: p.message ? String(p.message) : undefined } : null,
    log: r.log?.lines ?? [],
    result: r.result ?? {},
    error: r.error,
    requestedBy: r.requested_by,
    requestedByName: r.requested_by_name,
    heartbeatAt: hb,
    startedAt: r.started_at ? new Date(r.started_at) : null,
    finishedAt: r.finished_at ? new Date(r.finished_at) : null,
    createdAt: new Date(r.created_at),
    stalled: r.status === "running" && (!hb || now.getTime() - hb.getTime() > STALL_MS),
    noWorker: r.status === "queued" && now.getTime() - new Date(r.created_at).getTime() > NO_WORKER_MS,
  };
}

export async function getJob(db: Db, ctx: TenantContext, id: string): Promise<JobView | null> {
  return withTenant(db, ctx, async (tx) => {
    const [r] = await tx.execute<Raw>(sql`${SELECT} where j.id = ${id}`);
    return r ? toView(r, new Date()) : null;
  });
}

export async function listJobs(db: Db, ctx: TenantContext, limit = 20): Promise<JobView[]> {
  return withTenant(db, ctx, async (tx) => {
    const rows = await tx.execute<Raw>(sql`${SELECT} order by j.created_at desc limit ${limit}`);
    const now = new Date();
    return rows.map((r) => toView(r, now));
  });
}

/** The latest job of each kind, for "last run" lines. */
export async function latestJobs(db: Db, ctx: TenantContext): Promise<Partial<Record<JobView["kind"], JobView>>> {
  return withTenant(db, ctx, async (tx) => {
    const rows = await tx.execute<Raw>(sql`${SELECT} where j.id in (select distinct on (kind) id from jobs order by kind, created_at desc)`);
    const now = new Date();
    const out: Partial<Record<JobView["kind"], JobView>> = {};
    for (const r of rows) out[r.kind] = toView(r, now);
    return out;
  });
}

export async function activeJob(db: Db, ctx: TenantContext, kind: JobView["kind"]): Promise<JobView | null> {
  return withTenant(db, ctx, async (tx) => {
    const [r] = await tx.execute<Raw>(sql`${SELECT} where j.kind = ${kind} and j.status in ('queued', 'running') order by j.created_at desc limit 1`);
    return r ? toView(r, new Date()) : null;
  });
}
