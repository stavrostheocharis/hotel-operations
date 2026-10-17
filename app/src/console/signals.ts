import { sql, type SQL } from "drizzle-orm";
import { withTenant, type Db, type TenantContext } from "@/db";
import { ACTIONABLE_SOURCES } from "@/link/types";

/**
 * The signals inbox: every record as it arrived, and whether it found its
 * issue. Reads for the list, the record drawer and the "link to…"
 * suggestions.
 */
export type SignalView = "unlinked" | "today" | "all";
export const SIGNAL_VIEWS: SignalView[] = ["unlinked", "today", "all"];

export type SignalRow = {
  id: string;
  source: string;
  externalId: string;
  occurredAt: Date;
  language: string | null;
  locationCode: string | null;
  locationName: string | null;
  topic: string | null;
  category: string | null;
  text: string | null;
  issueId: string | null;
  issueTitle: string | null;
  issueStatus: string | null;
};

export type SignalQuery = {
  view: SignalView;
  timeZone: string;
  q?: string | null;
  source?: string | null;
  category?: string | null;
  from?: string | null;
  to?: string | null;
  nonEnglish?: boolean;
  page?: number;
  pageSize?: number;
};

const ACTIONABLE = sql.join(
  ACTIONABLE_SOURCES.map((s) => sql`${s}`),
  sql`, `,
);

function viewWhere(view: SignalView, tz: string): SQL {
  switch (view) {
    case "unlinked":
      // Records that should belong to an issue and do not: a problem, from a source that acts on its own.
      return sql`s.category is not null and s.category not in ('preventive', 'request') and s.source in (${ACTIONABLE}) and m.issue_id is null`;
    case "today":
      return sql`s.occurred_at >= ((now() at time zone ${tz})::date)::timestamp at time zone ${tz}`;
    case "all":
      return sql`true`;
  }
}

function filters(p: SignalQuery): SQL[] {
  const f: SQL[] = [sql`s.source <> 'pms'`];
  if (p.source) f.push(sql`s.source = ${p.source}`);
  if (p.category) f.push(sql`s.category = ${p.category}`);
  if (p.from) f.push(sql`s.occurred_at >= (${p.from}::date)::timestamp at time zone ${p.timeZone}`);
  if (p.to) f.push(sql`s.occurred_at < ((${p.to}::date) + 1)::timestamp at time zone ${p.timeZone}`);
  if (p.nonEnglish) f.push(sql`s.language is not null and s.language <> 'en'`);
  const q = p.q?.trim();
  if (q) {
    const like = `%${q}%`;
    f.push(sql`(s.external_id = ${q} or s.text_en ilike ${like} or s.text_original ilike ${like} or l.code ilike ${like} or l.name ilike ${like})`);
  }
  return f;
}

const BASE = sql`
  from signals s
  left join locations l on l.id = s.location_id
  left join lateral (
    select isg.issue_id from issue_signals isg where isg.signal_id = s.id order by isg.decided_at desc limit 1
  ) m on true
  left join issues i on i.id = m.issue_id`;

export async function listSignals(db: Db, ctx: TenantContext, p: SignalQuery): Promise<{ rows: SignalRow[]; total: number; page: number; pageSize: number }> {
  const pageSize = p.pageSize ?? 25;
  const page = Math.max(1, p.page ?? 1);
  return withTenant(db, ctx, async (tx) => {
    const where = sql.join([viewWhere(p.view, p.timeZone), ...filters(p)], sql` and `);
    const rows = await tx.execute<{
      id: string;
      source: string;
      external_id: string;
      occurred_at: Date;
      language: string | null;
      location_code: string | null;
      location_name: string | null;
      topic: string | null;
      category: string | null;
      text: string | null;
      issue_id: string | null;
      issue_title: string | null;
      issue_status: string | null;
      total: number;
    }>(sql`
      select s.id, s.source::text as source, s.external_id, s.occurred_at, s.language, l.code as location_code, l.name as location_name,
             s.topic, s.category, coalesce(s.text_en, s.text_original) as text,
             m.issue_id, i.title as issue_title, i.status::text as issue_status, count(*) over ()::int as total
      ${BASE}
      where ${where}
      order by s.occurred_at desc, s.id
      limit ${pageSize} offset ${(page - 1) * pageSize}
    `);
    return {
      page,
      pageSize,
      total: rows[0]?.total ?? 0,
      rows: rows.map((r) => ({
        id: r.id,
        source: r.source,
        externalId: r.external_id,
        occurredAt: new Date(r.occurred_at),
        language: r.language,
        locationCode: r.location_code,
        locationName: r.location_name,
        topic: r.topic,
        category: r.category,
        text: r.text,
        issueId: r.issue_id,
        issueTitle: r.issue_title,
        issueStatus: r.issue_status,
      })),
    };
  });
}

export async function countSignalViews(db: Db, ctx: TenantContext, p: Omit<SignalQuery, "view" | "page" | "pageSize">): Promise<Record<SignalView, number>> {
  return withTenant(db, ctx, async (tx) => {
    const f = filters({ ...p, view: "all" });
    const [r] = await tx.execute<Record<SignalView, number>>(sql`
      select count(*) filter (where ${viewWhere("unlinked", p.timeZone)})::int as unlinked,
             count(*) filter (where ${viewWhere("today", p.timeZone)})::int as today,
             count(*)::int as all
      ${BASE}
      where ${sql.join(f, sql` and `)}
    `);
    return r ?? { unlinked: 0, today: 0, all: 0 };
  });
}

export type SignalRecord = SignalRow & {
  textEn: string | null;
  textOriginal: string | null;
  languageConfidence: number | null;
  locationId: string | null;
  locationKind: string | null;
  locationMethod: string;
  locationConfidence: number | null;
  lockedFields: string[];
  normalized: Record<string, unknown>;
  raw: Record<string, unknown>;
  receivedAt: Date;
  stayRef: string | null;
  issues: { id: string; title: string; status: string; role: string; method: string; decidedBy: string }[];
};

export async function getSignal(db: Db, ctx: TenantContext, id: string): Promise<SignalRecord | null> {
  return withTenant(db, ctx, async (tx) => {
    const [r] = await tx.execute<{
      id: string;
      source: string;
      external_id: string;
      occurred_at: Date;
      received_at: Date;
      language: string | null;
      language_confidence: string | null;
      text_en: string | null;
      text_original: string | null;
      location_id: string | null;
      location_code: string | null;
      location_name: string | null;
      location_kind: string | null;
      location_method: string;
      location_confidence: string | null;
      topic: string | null;
      category: string | null;
      locked_fields: string[];
      normalized: Record<string, unknown>;
      raw: Record<string, unknown>;
      stay_ref: string | null;
    }>(sql`
      select s.id, s.source::text as source, s.external_id, s.occurred_at, s.received_at, s.language, s.language_confidence,
             s.text_en, s.text_original, s.location_id, l.code as location_code, l.name as location_name, l.kind::text as location_kind,
             s.location_method::text as location_method, s.location_confidence, s.topic, s.category, s.locked_fields, s.normalized, s.raw, s.stay_ref
      from signals s left join locations l on l.id = s.location_id
      where s.id = ${id}
    `);
    if (!r) return null;
    const issues = await tx.execute<{ id: string; title: string; status: string; role: string; method: string; decided_by: string }>(sql`
      select i.id, i.title, i.status::text as status, isg.role::text as role, isg.method::text as method, isg.decided_by
      from issue_signals isg join issues i on i.id = isg.issue_id
      where isg.signal_id = ${id} and i.superseded_at is null
      order by isg.decided_at desc
    `);
    const first = issues[0] ?? null;
    return {
      id: r.id,
      source: r.source,
      externalId: r.external_id,
      occurredAt: new Date(r.occurred_at),
      receivedAt: new Date(r.received_at),
      language: r.language,
      languageConfidence: r.language_confidence === null ? null : Number(r.language_confidence),
      locationId: r.location_id,
      locationCode: r.location_code,
      locationName: r.location_name,
      locationKind: r.location_kind,
      locationMethod: r.location_method,
      locationConfidence: r.location_confidence === null ? null : Number(r.location_confidence),
      topic: r.topic,
      category: r.category,
      text: r.text_en ?? r.text_original,
      textEn: r.text_en,
      textOriginal: r.text_original,
      lockedFields: r.locked_fields ?? [],
      normalized: r.normalized ?? {},
      raw: r.raw ?? {},
      stayRef: r.stay_ref,
      issueId: first?.id ?? null,
      issueTitle: first?.title ?? null,
      issueStatus: first?.status ?? null,
      issues: issues.map((i) => ({ id: i.id, title: i.title, status: i.status, role: i.role, method: i.method, decidedBy: i.decided_by })),
    };
  });
}

export type IssueSuggestion = { id: string; title: string; status: string; locationCode: string | null; category: string | null; openedAt: Date; reason: string };

/** Issues a record could belong to: same place (or the plant serving it) and category, within 90 days; then same category nearby in time. */
export async function suggestIssuesForSignal(db: Db, ctx: TenantContext, signal: Pick<SignalRecord, "id" | "locationId" | "category" | "occurredAt">): Promise<IssueSuggestion[]> {
  return withTenant(db, ctx, async (tx) => {
    const rows = await tx.execute<{ id: string; title: string; status: string; location_code: string | null; category: string | null; opened_at: Date; reason: string }>(sql`
      with place as (
        select ${signal.locationId}::uuid as id
        union
        select ll.equipment_id from location_links ll where ll.serves_id = ${signal.locationId}::uuid
        union
        select l.parent_id from locations l where l.id = ${signal.locationId}::uuid
      )
      select i.id, i.title, i.status::text as status, l.code as location_code, i.category, i.opened_at,
             case when i.location_id = ${signal.locationId}::uuid then 'same place'
                  when i.location_id in (select id from place) then 'serves or contains this place'
                  else 'same category, close in time' end as reason
      from issues i left join locations l on l.id = i.location_id
      where i.superseded_at is null
        and not exists (select 1 from issue_signals x where x.issue_id = i.id and x.signal_id = ${signal.id})
        and (
          (i.location_id in (select id from place where id is not null) and (i.category = ${signal.category} or ${signal.category}::text is null))
          or (i.category = ${signal.category} and i.opened_at between ${signal.occurredAt.toISOString()}::timestamptz - interval '14 days' and ${signal.occurredAt.toISOString()}::timestamptz + interval '14 days')
        )
      order by (i.location_id = ${signal.locationId}::uuid) desc, abs(extract(epoch from (i.opened_at - ${signal.occurredAt.toISOString()}::timestamptz))) asc
      limit 8
    `);
    return rows.map((r) => ({ id: r.id, title: r.title, status: r.status, locationCode: r.location_code, category: r.category, openedAt: new Date(r.opened_at), reason: r.reason }));
  });
}

export type IssueMatch = { id: string; title: string; status: string; locationCode: string | null };

/** Free-text search over open issues, for the "link to…" dialog. */
export async function searchIssues(db: Db, ctx: TenantContext, q: string, limit = 10): Promise<IssueMatch[]> {
  const like = `%${q.trim()}%`;
  if (!q.trim()) return [];
  return withTenant(db, ctx, async (tx) => {
    const rows = await tx.execute<{ id: string; title: string; status: string; location_code: string | null }>(sql`
      select i.id, i.title, i.status::text as status, l.code as location_code
      from issues i left join locations l on l.id = i.location_id
      where i.superseded_at is null and (i.title ilike ${like} or l.code ilike ${like} or l.name ilike ${like})
      order by (i.status in ('verified', 'closed_unverified')) asc, i.reopen_count desc, i.opened_at desc
      limit ${limit}
    `);
    return rows.map((r) => ({ id: r.id, title: r.title, status: r.status, locationCode: r.location_code }));
  });
}

export type PlaceOption = { id: string; code: string; name: string; kind: string };

export async function listPlaces(db: Db, ctx: TenantContext): Promise<PlaceOption[]> {
  return withTenant(db, ctx, async (tx) => {
    const rows = await tx.execute<{ id: string; code: string; name: string; kind: string }>(sql`
      select id, code, name, kind::text as kind from locations where kind <> 'property' order by kind, code
    `);
    return rows.map((r) => ({ ...r }));
  });
}
