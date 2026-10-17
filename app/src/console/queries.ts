import { sql } from "drizzle-orm";
import { withTenant, type Db, type TenantContext } from "@/db";

/**
 * Read models for the console. Every query runs inside withTenant(), so row
 * level security scopes it to the current property; the SQL never filters
 * by property itself.
 */

export type IssueFilter = "all" | "reopened" | "open" | "clusters" | "unverified";
export const ISSUE_FILTERS: { key: IssueFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "reopened", label: "Reopened" },
  { key: "open", label: "Open" },
  { key: "clusters", label: "Shared cause" },
  { key: "unverified", label: "Closed, unverified" },
];

export type IssueRow = {
  id: string;
  title: string;
  status: string;
  severity: string;
  category: string | null;
  reopenCount: number;
  openedAt: Date;
  resolvedAt: Date | null;
  locationCode: string | null;
  locationKind: string | null;
  ownerName: string | null;
  department: string | null;
  signals: number;
  firstAt: Date;
  lastAt: Date;
  sources: string;
};

const FILTER_SQL: Record<IssueFilter, ReturnType<typeof sql>> = {
  all: sql`true`,
  reopened: sql`(i.status = 'reopened' or i.reopen_count > 0)`,
  open: sql`i.status in ('detected', 'assigned')`,
  clusters: sql`l.kind in ('equipment', 'building', 'floor')`,
  unverified: sql`i.status = 'closed_unverified'`,
};

export async function listIssues(db: Db, ctx: TenantContext, filter: IssueFilter, limit = 150): Promise<{ rows: IssueRow[]; total: number }> {
  return withTenant(db, ctx, async (tx) => {
    const where = FILTER_SQL[filter] ?? FILTER_SQL.all;
    const rows = await tx.execute<{
      id: string;
      title: string;
      status: string;
      severity: string;
      category: string | null;
      reopen_count: number;
      opened_at: Date;
      resolved_at: Date | null;
      location_code: string | null;
      location_kind: string | null;
      owner_name: string | null;
      department: string | null;
      signals: number;
      first_at: Date;
      last_at: Date;
      sources: string;
      total: number;
    }>(sql`
      select i.id, i.title, i.status, i.severity, i.category, i.reopen_count, i.opened_at, i.resolved_at,
             l.code as location_code, l.kind as location_kind, ou.name as owner_name, i.department,
             s.n as signals, s.first_at, s.last_at, s.sources,
             count(*) over ()::int as total
      from issues i
      left join locations l on l.id = i.location_id
      left join users ou on ou.id = i.owner_user_id
      join lateral (
        select count(*)::int as n, min(sg.occurred_at) as first_at, max(sg.occurred_at) as last_at,
               string_agg(distinct sg.source::text, ',') as sources
        from issue_signals isg join signals sg on sg.id = isg.signal_id
        where isg.issue_id = i.id
      ) s on true
      where i.superseded_at is null and ${where}
      order by i.reopen_count desc, s.n desc, s.last_at desc
      limit ${limit}
    `);
    return {
      total: rows[0]?.total ?? 0,
      rows: rows.map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        severity: r.severity,
        category: r.category,
        reopenCount: r.reopen_count,
        openedAt: new Date(r.opened_at),
        resolvedAt: r.resolved_at ? new Date(r.resolved_at) : null,
        locationCode: r.location_code,
        locationKind: r.location_kind,
        ownerName: r.owner_name,
        department: r.department,
        signals: r.signals,
        firstAt: new Date(r.first_at),
        lastAt: new Date(r.last_at),
        sources: r.sources,
      })),
    };
  });
}

export type FilterCounts = Record<IssueFilter, number>;

export async function countIssues(db: Db, ctx: TenantContext): Promise<FilterCounts> {
  return withTenant(db, ctx, async (tx) => {
    const [r] = await tx.execute<{ all: number; reopened: number; open: number; clusters: number; unverified: number }>(sql`
      select count(*)::int as all,
             count(*) filter (where i.status = 'reopened' or i.reopen_count > 0)::int as reopened,
             count(*) filter (where i.status in ('detected', 'assigned'))::int as open,
             count(*) filter (where l.kind in ('equipment', 'building', 'floor'))::int as clusters,
             count(*) filter (where i.status = 'closed_unverified')::int as unverified
      from issues i left join locations l on l.id = i.location_id
      where i.superseded_at is null
    `);
    return r ?? { all: 0, reopened: 0, open: 0, clusters: 0, unverified: 0 };
  });
}

export type Kpis = {
  open: number;
  reopened: number;
  everReopened: number;
  withClosure: number;
  reopenRate: number | null;
  repeats: number;
  roomNights: number;
  repeatsPerThousandRoomNights: number | null;
  medianHoursToResolve: number | null;
  byCategory: { category: string; issues: number; reopened: number; medianHours: number | null }[];
};

export async function getKpis(db: Db, ctx: TenantContext): Promise<Kpis> {
  return withTenant(db, ctx, async (tx) => {
    const [t] = await tx.execute<{
      open: number;
      reopened: number;
      ever_reopened: number;
      with_closure: number;
      repeats: number;
      room_nights: number;
      median_hours: number | null;
    }>(sql`
      select
        (select count(*) from issues where status in ('detected', 'assigned'))::int as open,
        (select count(*) from issues where status = 'reopened')::int as reopened,
        (select count(*) from issues where reopen_count > 0)::int as ever_reopened,
        (select count(*) from issues where status in ('resolved', 'reopened', 'closed_unverified', 'verified'))::int as with_closure,
        (select count(*) from outcomes where kind = 'recurred')::int as repeats,
        (select coalesce(sum(rooms_occupied), 0) from occupancy_daily)::int as room_nights,
        (select percentile_cont(0.5) within group (order by extract(epoch from (resolved_at - opened_at)) / 3600)
           from issues where resolved_at is not null)::float as median_hours
    `);
    const byCategory = await tx.execute<{ category: string; issues: number; reopened: number; median_hours: number | null }>(sql`
      select coalesce(category, 'unclassified') as category,
             count(*)::int as issues,
             count(*) filter (where reopen_count > 0)::int as reopened,
             (percentile_cont(0.5) within group (order by extract(epoch from (resolved_at - opened_at)) / 3600)
                filter (where resolved_at is not null))::float as median_hours
      from issues
      group by 1
      having count(*) >= 5
      order by reopened desc, issues desc
      limit 8
    `);
    const row = t ?? { open: 0, reopened: 0, ever_reopened: 0, with_closure: 0, repeats: 0, room_nights: 0, median_hours: null };
    return {
      open: row.open,
      reopened: row.reopened,
      everReopened: row.ever_reopened,
      withClosure: row.with_closure,
      reopenRate: row.with_closure ? row.ever_reopened / row.with_closure : null,
      repeats: row.repeats,
      roomNights: row.room_nights,
      repeatsPerThousandRoomNights: row.room_nights ? (1000 * row.repeats) / row.room_nights : null,
      medianHoursToResolve: row.median_hours === null ? null : Number(row.median_hours),
      byCategory: byCategory.map((c) => ({
        category: c.category,
        issues: c.issues,
        reopened: c.reopened,
        medianHours: c.median_hours === null ? null : Number(c.median_hours),
      })),
    };
  });
}

export type IssueDetail = {
  id: string;
  title: string;
  status: string;
  severity: string;
  category: string | null;
  reopenCount: number;
  openedAt: Date;
  resolvedAt: Date | null;
  rootCause: string | null;
  recurrenceWindowDays: number;
  locationId: string | null;
  locationCode: string | null;
  locationName: string | null;
  locationKind: string | null;
  department: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
  /** 'system' while the linker owns the status, 'human' once a person set it. */
  statusSource: string;
  statusChangedAt: Date | null;
  verifiedAt: Date | null;
  verifiedByName: string | null;
  supersededAt: Date | null;
  supersededByIssueId: string | null;
  derivedStatus: string;
  signals: IssueSignal[];
  actions: { id: string; kind: string; externalRef: string | null; actor: string | null; performedAt: Date; details: Record<string, unknown> }[];
  outcomes: { id: string; kind: string; strength: number; observedAt: Date; evidence: Record<string, unknown> }[];
};

export type IssueSignal = {
  id: string;
  source: string;
  externalId: string;
  occurredAt: Date;
  language: string | null;
  textOriginal: string | null;
  textEn: string | null;
  topic: string | null;
  category: string | null;
  locationCode: string | null;
  role: string;
  method: string;
  confidence: number | null;
  evidence: Record<string, unknown>;
  decidedBy: string;
  /** The person's name when decided_by is a user id. */
  decidedByName: string | null;
};

export async function getIssue(db: Db, ctx: TenantContext, issueId: string): Promise<IssueDetail | null> {
  return withTenant(db, ctx, async (tx) => {
    const [i] = await tx.execute<{
      id: string;
      title: string;
      status: string;
      severity: string;
      category: string | null;
      reopen_count: number;
      opened_at: Date;
      resolved_at: Date | null;
      root_cause: string | null;
      recurrence_window_days: number;
      location_id: string | null;
      location_code: string | null;
      location_name: string | null;
      location_kind: string | null;
      department: string | null;
      owner_user_id: string | null;
      owner_name: string | null;
      status_source: string;
      status_changed_at: Date | null;
      verified_at: Date | null;
      verified_by_name: string | null;
      superseded_at: Date | null;
      superseded_by_issue_id: string | null;
      derived_status: string;
    }>(sql`
      select i.id, i.title, i.status, i.severity, i.category, i.reopen_count, i.opened_at, i.resolved_at, i.root_cause,
             i.recurrence_window_days, l.id as location_id, l.code as location_code, l.name as location_name, l.kind as location_kind,
             i.department, i.owner_user_id, ou.name as owner_name, i.status_source, i.status_changed_at,
             i.verified_at, vu.name as verified_by_name, i.superseded_at, i.superseded_by_issue_id, i.derived_status
      from issues i
      left join locations l on l.id = i.location_id
      left join users ou on ou.id = i.owner_user_id
      left join users vu on vu.id = i.verified_by
      where i.id = ${issueId}
    `);
    if (!i) return null;
    const signals = await tx.execute<{
      id: string;
      source: string;
      external_id: string;
      occurred_at: Date;
      language: string | null;
      text_original: string | null;
      text_en: string | null;
      topic: string | null;
      category: string | null;
      location_code: string | null;
      role: string;
      method: string;
      confidence: string | null;
      evidence: Record<string, unknown>;
      decided_by: string;
      decided_by_name: string | null;
    }>(sql`
      select sg.id, sg.source, sg.external_id, sg.occurred_at, sg.language, sg.text_original, sg.text_en, sg.topic, sg.category,
             l.code as location_code, isg.role, isg.method, isg.confidence, isg.evidence, isg.decided_by,
             du.name as decided_by_name
      from issue_signals isg
      join signals sg on sg.id = isg.signal_id
      left join locations l on l.id = sg.location_id
      left join users du on du.id::text = isg.decided_by
      where isg.issue_id = ${issueId}
      order by sg.occurred_at
    `);
    const actions = await tx.execute<{ id: string; kind: string; external_ref: string | null; actor: string | null; performed_at: Date; details: Record<string, unknown> }>(sql`
      select id, kind, external_ref, actor, performed_at, details from actions where issue_id = ${issueId} order by performed_at
    `);
    const outcomes = await tx.execute<{ id: string; kind: string; strength: number; observed_at: Date; evidence: Record<string, unknown> }>(sql`
      select id, kind, strength, observed_at, evidence from outcomes where issue_id = ${issueId} order by observed_at
    `);
    return {
      id: i.id,
      title: i.title,
      status: i.status,
      severity: i.severity,
      category: i.category,
      reopenCount: i.reopen_count,
      openedAt: new Date(i.opened_at),
      resolvedAt: i.resolved_at ? new Date(i.resolved_at) : null,
      rootCause: i.root_cause,
      recurrenceWindowDays: i.recurrence_window_days,
      locationId: i.location_id,
      locationCode: i.location_code,
      locationName: i.location_name,
      locationKind: i.location_kind,
      department: i.department,
      ownerUserId: i.owner_user_id,
      ownerName: i.owner_name,
      statusSource: i.status_source,
      statusChangedAt: i.status_changed_at ? new Date(i.status_changed_at) : null,
      verifiedAt: i.verified_at ? new Date(i.verified_at) : null,
      verifiedByName: i.verified_by_name,
      supersededAt: i.superseded_at ? new Date(i.superseded_at) : null,
      supersededByIssueId: i.superseded_by_issue_id,
      derivedStatus: i.derived_status,
      signals: signals.map((s) => ({
        id: s.id,
        source: s.source,
        externalId: s.external_id,
        occurredAt: new Date(s.occurred_at),
        language: s.language,
        textOriginal: s.text_original,
        textEn: s.text_en,
        topic: s.topic,
        category: s.category,
        locationCode: s.location_code,
        role: s.role,
        method: s.method,
        confidence: s.confidence === null ? null : Number(s.confidence),
        evidence: s.evidence ?? {},
        decidedBy: s.decided_by,
        decidedByName: s.decided_by_name,
      })),
      actions: actions.map((a) => ({ id: a.id, kind: a.kind, externalRef: a.external_ref, actor: a.actor, performedAt: new Date(a.performed_at), details: a.details ?? {} })),
      outcomes: outcomes.map((o) => ({ id: o.id, kind: o.kind, strength: o.strength, observedAt: new Date(o.observed_at), evidence: o.evidence ?? {} })),
    };
  });
}
