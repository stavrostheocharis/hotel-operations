import { sql } from "drizzle-orm";
import { withTenant, type Db, type TenantContext } from "@/db";
import { listVerifications, type VerificationRow } from "./verification";

/**
 * "What needs a person today?" Three short lists and one strip of counts.
 * `department` narrows to one department's issues (the "Mine" chip).
 */
export type IssueBrief = {
  id: string;
  title: string;
  status: string;
  locationCode: string | null;
  locationName: string | null;
  department: string | null;
  ownerName: string | null;
  reopenCount: number;
  openedAt: Date;
  lastAt: Date | null;
  /** When it last came back (for the "came back" list). */
  recurredAt: Date | null;
};

export type TodayDigest = {
  todayRecords: { total: number; bySource: { source: string; count: number }[] };
  lastImportAt: Date | null;
  cameBack: { rows: IssueBrief[]; total: number };
  unassigned: { rows: IssueBrief[]; total: number };
  verificationsDue: { rows: VerificationRow[]; total: number };
};

type BriefRaw = {
  id: string;
  title: string;
  status: string;
  location_code: string | null;
  location_name: string | null;
  department: string | null;
  owner_name: string | null;
  reopen_count: number;
  opened_at: Date;
  last_at: Date | null;
  recurred_at: Date | null;
  total: number;
};

const toBrief = (r: BriefRaw): IssueBrief => ({
  id: r.id,
  title: r.title,
  status: r.status,
  locationCode: r.location_code,
  locationName: r.location_name,
  department: r.department,
  ownerName: r.owner_name,
  reopenCount: r.reopen_count,
  openedAt: new Date(r.opened_at),
  lastAt: r.last_at ? new Date(r.last_at) : null,
  recurredAt: r.recurred_at ? new Date(r.recurred_at) : null,
});

export async function getTodayDigest(db: Db, ctx: TenantContext, p: { timeZone: string; userId: string; department?: string | null; limit?: number }): Promise<TodayDigest> {
  const limit = p.limit ?? 5;
  const tz = p.timeZone;
  const dept = p.department ? sql`and i.department = ${p.department}` : sql``;
  const [records, lastImport, cameBack, unassigned, due] = await Promise.all([
    withTenant(db, ctx, (tx) =>
      tx.execute<{ source: string; count: number }>(sql`
        select source::text as source, count(*)::int as count
        from signals
        where source <> 'pms' and occurred_at >= ((now() at time zone ${tz})::date)::timestamp at time zone ${tz}
        group by 1 order by 2 desc
      `),
    ),
    withTenant(db, ctx, async (tx) => {
      const [r] = await tx.execute<{ at: Date | null }>(sql`select max(occurred_at) as at from events where type = 'ingest.completed'`);
      return r?.at ? new Date(r.at) : null;
    }),
    withTenant(db, ctx, (tx) =>
      tx.execute<BriefRaw>(sql`
        with back as (
          select i.id, max(o.observed_at) as recurred_at
          from issues i join outcomes o on o.issue_id = i.id and o.kind = 'recurred'
          where i.superseded_at is null and o.observed_at > now() - interval '7 days' ${dept}
          group by i.id
          union
          select i.id, i.status_changed_at
          from issues i
          where i.superseded_at is null and i.status = 'reopened' and i.status_changed_at > now() - interval '7 days' ${dept}
        )
        select i.id, i.title, i.status::text as status, l.code as location_code, l.name as location_name, i.department::text as department,
               ou.name as owner_name, i.reopen_count, i.opened_at,
               (select max(s.occurred_at) from issue_signals x join signals s on s.id = x.signal_id where x.issue_id = i.id) as last_at,
               b.recurred_at, count(*) over ()::int as total
        from (select id, max(recurred_at) as recurred_at from back group by id) b
        join issues i on i.id = b.id
        left join locations l on l.id = i.location_id
        left join users ou on ou.id = i.owner_user_id
        order by b.recurred_at desc nulls last
        limit ${limit}
      `),
    ),
    withTenant(db, ctx, (tx) =>
      tx.execute<BriefRaw>(sql`
        select i.id, i.title, i.status::text as status, l.code as location_code, l.name as location_name, i.department::text as department,
               null as owner_name, i.reopen_count, i.opened_at,
               (select max(s.occurred_at) from issue_signals x join signals s on s.id = x.signal_id where x.issue_id = i.id) as last_at,
               null as recurred_at, count(*) over ()::int as total
        from issues i
        left join locations l on l.id = i.location_id
        where i.superseded_at is null and i.owner_user_id is null and i.status in ('detected', 'reopened') ${dept}
        order by i.reopen_count desc, i.opened_at asc
        limit ${limit}
      `),
    ),
    listVerifications(db, ctx, { view: "due", now: new Date(), timeZone: tz, userId: p.userId, department: p.department, pageSize: limit }),
  ]);
  return {
    todayRecords: { total: records.reduce((n, r) => n + r.count, 0), bySource: records.map((r) => ({ source: r.source, count: r.count })) },
    lastImportAt: lastImport,
    cameBack: { rows: cameBack.map(toBrief), total: cameBack[0]?.total ?? 0 },
    unassigned: { rows: unassigned.map(toBrief), total: unassigned[0]?.total ?? 0 },
    verificationsDue: due,
  };
}
