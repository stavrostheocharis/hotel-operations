import { sql, type SQL } from "drizzle-orm";
import { withTenant, type Db, type TenantContext, type Tx } from "@/db";
import { assessRecords, type RecordsRow } from "./records";
import { AUDIT_VERSION, type AuditReport, type HeldRow, type RecurringFailure, type WinterWorksItem } from "./types";
import { topicLabel } from "@/console/format";

/**
 * Computes the season audit for the property in the tenant context. Every
 * query runs under withTenant(), so the SQL never filters by property.
 *
 * The season window is the property's season_open..season_close unless
 * overridden; dates are property-local calendar days. Records are counted
 * by when they occurred, closures by when the ticket was closed, tickets by
 * when they were raised, issues by when they opened.
 */
export type AuditOptions = {
  from?: string;
  to?: string;
  label?: string;
  /** How many recurring failures to list (default 25). */
  topRecurring?: number;
  /** How many winter-works items to rank (default 20). */
  topWorks?: number;
};

const LIVE = sql`('front_desk', 'work_order', 'staff_report', 'guest_qr', 'compensation')`;

export async function buildAuditReport(db: Db, ctx: TenantContext, opts: AuditOptions = {}): Promise<AuditReport> {
  return withTenant(db, ctx, async (tx) => {
    const [p] = await tx.execute<{ code: string; name: string; timezone: string; season_open: string | null; season_close: string | null }>(sql`
      select code, name, timezone, season_open::text, season_close::text from properties limit 1
    `);
    if (!p) throw new Error("no property visible in this tenant context");
    const tz = p.timezone;

    let from = opts.from ?? p.season_open;
    let to = opts.to ?? p.season_close;
    if (!from || !to) {
      const [r] = await tx.execute<{ lo: string | null; hi: string | null }>(sql`
        select to_char(min(occurred_at) at time zone ${tz}, 'YYYY-MM-DD') as lo, to_char(max(occurred_at) at time zone ${tz}, 'YYYY-MM-DD') as hi
        from signals where source <> 'pms'
      `);
      from = from ?? r?.lo ?? new Date().toISOString().slice(0, 10);
      to = to ?? r?.hi ?? from;
    }
    const label = opts.label ?? (opts.from || opts.to ? `${from} to ${to}` : `${from.slice(0, 4)} season`);

    // Property-local midnight at both ends; `end` is exclusive.
    const start = sql`((${from}::date)::timestamp at time zone ${tz})`;
    const end = sql`(((${to}::date) + 1)::timestamp at time zone ${tz})`;
    const within = (col: SQL) => sql`(${col} >= ${start} and ${col} < ${end})`;
    const month = (col: SQL) => sql`to_char(${col} at time zone ${tz}, 'YYYY-MM')`;

    const [bySource, byLanguage, roomNights, issueRows, heldRows, ttrRows, repeats, voiceBySource, voiceByTopic, examples, surveyRows, recordsRow] =
      await Promise.all([
        volumeBySource(tx, within),
        volumeByLanguage(tx, within),
        occupiedRoomNights(tx, from, to),
        issueAggregates(tx, within),
        closureRows(tx, within, month),
        ticketRows(tx, within, month, start, end),
        recurredOutcomes(tx, within),
        guestVoiceBySource(tx, within),
        guestVoiceByTopic(tx, within),
        unticketedExamples(tx, within),
        surveyScores(tx, within),
        recordsMetrics(tx, within),
      ]);

    // --- issues -------------------------------------------------------
    const failures: RecurringFailure[] = issueRows.map((r) => ({
      issueId: r.id,
      title: r.title,
      topic: r.topic,
      category: r.category,
      status: r.status,
      locationCode: r.location_code,
      locationKind: r.location_kind,
      locationName: r.location_name,
      episodes: r.episodes,
      reopens: r.reopen_count,
      signals: r.signals,
      tickets: r.tickets,
      closures: r.closures,
      repeatTickets: r.repeat_tickets,
      roomsAffected: r.rooms_affected,
      guestReports: r.guest_reports,
      deskComplaints: r.desk_complaints,
      surveyMentions: r.survey_mentions,
      reviewMentions: r.review_mentions,
      firstAt: new Date(r.first_at).toISOString(),
      lastAt: new Date(r.last_at).toISOString(),
    }));
    const isRecurring = (f: RecurringFailure) => f.episodes >= 2 || f.reopens >= 1;
    const recurrence = (f: RecurringFailure) => f.episodes + f.reopens;
    const recurringAll = failures.filter(isRecurring);
    const recurring = [...recurringAll]
      .sort((a, b) => recurrence(b) - recurrence(a) || b.guestReports - a.guestReports || b.signals - a.signals)
      .slice(0, opts.topRecurring ?? 25);

    const byKind = new Map<string, { issues: number; recurring: number }>();
    for (const f of failures) {
      const k = f.locationKind ?? "unknown";
      const e = byKind.get(k) ?? { issues: 0, recurring: 0 };
      e.issues++;
      if (isRecurring(f)) e.recurring++;
      byKind.set(k, e);
    }
    const byLocationKind = [...byKind].map(([kind, v]) => ({ kind, ...v })).sort((a, b) => b.recurring - a.recurring || b.issues - a.issues);

    // --- winter works ---------------------------------------------------
    const winterWorks: WinterWorksItem[] = recurringAll
      .map((f) => ({ f, priority: recurrence(f) * (1 + f.guestReports) * (1 + f.repeatTickets) }))
      .sort((a, b) => b.priority - a.priority || recurrence(b.f) - recurrence(a.f))
      .slice(0, opts.topWorks ?? 20)
      .map(({ f, priority }, i) => ({ ...f, rank: i + 1, priority, evidence: evidenceLine(f, tz) }));

    // --- fixes that held -----------------------------------------------
    const held = (rows: typeof heldRows): HeldRow => ({
      closures: rows.length,
      back7: rows.filter((r) => r.back7).length,
      back30: rows.filter((r) => r.back30).length,
      back90: rows.filter((r) => r.back90).length,
    });
    const heldTotal = held(heldRows);
    const fixesHeld = {
      total: heldTotal,
      byCategory: groupBy(heldRows, (r) => r.category)
        .map(([category, rows]) => ({ category, ...held(rows) }))
        .sort((a, b) => b.back30 - a.back30 || b.closures - a.closures),
      byMonth: groupBy(heldRows, (r) => r.month)
        .map(([m, rows]) => ({ month: m, ...held(rows) }))
        .sort((a, b) => a.month.localeCompare(b.month)),
    };

    // --- time to resolve ------------------------------------------------
    const stats = (rows: typeof ttrRows) => {
      const hours = rows.map((r) => Number(r.hours)).filter((h) => Number.isFinite(h) && h >= 0);
      return { tickets: rows.length, medianHours: quantile(hours, 0.5), p90Hours: quantile(hours, 0.9) };
    };
    const firstHalfRows = ttrRows.filter((r) => r.first_half);
    const secondHalfRows = ttrRows.filter((r) => !r.first_half);
    const timeToResolve = {
      byCategory: groupBy(ttrRows, (r) => r.category)
        .map(([category, rows]) => ({ category, ...stats(rows) }))
        .sort((a, b) => (b.medianHours ?? 0) - (a.medianHours ?? 0)),
      byMonth: groupBy(ttrRows, (r) => r.month)
        .map(([m, rows]) => ({ month: m, ...stats(rows) }))
        .sort((a, b) => a.month.localeCompare(b.month)),
      firstHalf: { tickets: firstHalfRows.length, medianHours: stats(firstHalfRows).medianHours },
      secondHalf: { tickets: secondHalfRows.length, medianHours: stats(secondHalfRows).medianHours },
    };

    // --- guest voice ----------------------------------------------------
    const byTopic = voiceByTopic.map((r) => ({
      topic: r.topic,
      category: r.category,
      mentions: r.mentions,
      linked: r.linked,
      withTicket: r.with_ticket,
      avgScore: r.avg_score === null ? null : round(Number(r.avg_score), 1),
    }));
    const exampleByTopic = groupBy(examples, (e) => e.topic);
    const silent = byTopic
      .filter((t) => t.mentions >= 3 && t.withTicket / t.mentions < 0.25)
      .map((t) => ({
        topic: t.topic,
        category: t.category,
        mentions: t.mentions,
        withTicket: t.withTicket,
        examples: (exampleByTopic.find(([k]) => k === t.topic)?.[1] ?? []).map((e) => ({
          source: e.source,
          date: new Date(e.occurred_at).toISOString().slice(0, 10),
          text: clip(e.text ?? "", 180),
        })),
      }));
    const surveyGroup = (linked: boolean) => {
      const r = surveyRows.find((s) => s.linked === linked);
      return {
        responses: r?.responses ?? 0,
        avgOverall: r?.avg_overall == null ? null : round(Number(r.avg_overall), 1),
        avgNps: r?.avg_nps == null ? null : round(Number(r.avg_nps), 1),
        recommendShare: r?.recommend_share == null ? null : round(Number(r.recommend_share), 3),
      };
    };

    // --- baseline -------------------------------------------------------
    const withClosure = failures.filter((f) => ["resolved", "reopened", "closed_unverified", "verified"].includes(f.status)).length;
    const everReopened = failures.filter((f) => f.reopens > 0).length;
    const allHours = ttrRows.map((r) => Number(r.hours)).filter((h) => Number.isFinite(h) && h >= 0);

    return {
      version: AUDIT_VERSION,
      generatedAt: new Date().toISOString(),
      property: { code: p.code, name: p.name, timezone: tz },
      season: { from, to, label },
      volume: {
        signalsTotal: bySource.reduce((n, r) => n + r.count, 0),
        bySource,
        byLanguage,
        issues: failures.length,
        issuesRecurring: recurringAll.length,
        byLocationKind,
        roomNights,
      },
      baseline: {
        repeats,
        roomNights,
        repeatsPerThousandRoomNights: roomNights ? round((1000 * repeats) / roomNights, 2) : null,
        closures: heldTotal.closures,
        held30: heldTotal.closures - heldTotal.back30,
        held30Share: heldTotal.closures ? round((heldTotal.closures - heldTotal.back30) / heldTotal.closures, 3) : null,
        issuesWithClosure: withClosure,
        issuesReopened: everReopened,
        reopenRate: withClosure ? round(everReopened / withClosure, 3) : null,
        medianHoursToResolve: quantile(allHours, 0.5),
      },
      recurring,
      fixesHeld,
      timeToResolve,
      guestVoice: {
        bySource: voiceBySource.map((r) => ({ source: r.source, withTopic: r.with_topic, linked: r.linked, withTicket: r.with_ticket })),
        byTopic,
        silent,
        surveys: { withLinkedIssue: surveyGroup(true), others: surveyGroup(false) },
      },
      winterWorks,
      records: assessRecords(recordsRow),
    };
  });
}

// ---------------------------------------------------------------------------
// Queries. Each returns plain rows; the assembly above turns them into the
// report so the SQL stays flat and easy to check in psql.
// ---------------------------------------------------------------------------

type Within = (col: SQL) => SQL;
type Month = (col: SQL) => SQL;

async function volumeBySource(tx: Tx, within: Within) {
  const rows = await tx.execute<{ source: string; count: number }>(sql`
    select source::text as source, count(*)::int as count
    from signals where source <> 'pms' and ${within(sql`occurred_at`)}
    group by 1 order by 2 desc
  `);
  return rows.map((r) => ({ source: r.source, count: r.count }));
}

async function volumeByLanguage(tx: Tx, within: Within) {
  const rows = await tx.execute<{ language: string; count: number }>(sql`
    select coalesce(language, 'unknown') as language, count(*)::int as count
    from signals where source <> 'pms' and text_original is not null and ${within(sql`occurred_at`)}
    group by 1 order by 2 desc
  `);
  return rows.map((r) => ({ language: r.language, count: r.count }));
}

async function occupiedRoomNights(tx: Tx, from: string, to: string) {
  const [r] = await tx.execute<{ n: number }>(sql`
    select coalesce(sum(rooms_occupied), 0)::int as n from occupancy_daily where day >= ${from}::date and day <= ${to}::date
  `);
  return r?.n ?? 0;
}

async function issueAggregates(tx: Tx, within: Within) {
  return tx.execute<{
    id: string;
    title: string;
    topic: string | null;
    category: string | null;
    status: string;
    reopen_count: number;
    episodes: number;
    location_code: string | null;
    location_kind: string | null;
    location_name: string | null;
    signals: number;
    guest_reports: number;
    desk_complaints: number;
    survey_mentions: number;
    review_mentions: number;
    rooms_affected: number;
    first_at: Date;
    last_at: Date;
    tickets: number;
    closures: number;
    repeat_tickets: number;
  }>(sql`
    with ep as (
      select id, coalesce((regexp_match(root_cause, '(\\d+) episodes?'))[1]::int, 1) as episodes from issues
    ), tk as (
      select issue_id, performed_at, (details->>'closed_at')::timestamptz as closed_at
      from actions where kind = 'ticket_created'
    ), first_close as (
      select issue_id, min(closed_at) as at from tk where closed_at is not null group by issue_id
    )
    select i.id, i.title, i.category, i.status::text as status, i.reopen_count, ep.episodes,
           l.code as location_code, l.kind::text as location_kind, l.name as location_name,
           (select s.topic from issue_signals x join signals s on s.id = x.signal_id
             where x.issue_id = i.id and x.role = 'primary' limit 1) as topic,
           count(*)::int as signals,
           count(*) filter (where s.source in ('front_desk', 'survey', 'review'))::int as guest_reports,
           count(*) filter (where s.source = 'front_desk')::int as desk_complaints,
           count(*) filter (where s.source = 'survey')::int as survey_mentions,
           count(*) filter (where s.source = 'review')::int as review_mentions,
           count(distinct s.location_id) filter (where sl.kind = 'room')::int as rooms_affected,
           min(s.occurred_at) as first_at, max(s.occurred_at) as last_at,
           (select count(*) from tk where tk.issue_id = i.id)::int as tickets,
           (select count(*) from tk where tk.issue_id = i.id and tk.closed_at is not null)::int as closures,
           (select count(*) from tk join first_close f on f.issue_id = tk.issue_id
             where tk.issue_id = i.id and tk.performed_at > f.at)::int as repeat_tickets
    from issues i
    join ep on ep.id = i.id
    left join locations l on l.id = i.location_id
    join issue_signals isg on isg.issue_id = i.id
    join signals s on s.id = isg.signal_id
    left join locations sl on sl.id = s.location_id
    where ${within(sql`i.opened_at`)}
    group by i.id, ep.episodes, l.code, l.kind, l.name
  `);
}

async function closureRows(tx: Tx, within: Within, month: Month) {
  const rows = await tx.execute<{ category: string; month: string; back7: boolean; back30: boolean; back90: boolean }>(sql`
    with c as (
      select a.issue_id, (a.details->>'closed_at')::timestamptz as closed_at, coalesce(i.category, 'unclassified') as category
      from actions a join issues i on i.id = a.issue_id
      where a.kind = 'ticket_created' and a.details->>'closed_at' is not null
    )
    select c.category, ${month(sql`c.closed_at`)} as month,
           exists (select 1 from issue_signals isg join signals s on s.id = isg.signal_id
                   where isg.issue_id = c.issue_id and s.source in ${LIVE}
                     and s.occurred_at > c.closed_at and s.occurred_at <= c.closed_at + interval '7 days') as back7,
           exists (select 1 from issue_signals isg join signals s on s.id = isg.signal_id
                   where isg.issue_id = c.issue_id and s.source in ${LIVE}
                     and s.occurred_at > c.closed_at and s.occurred_at <= c.closed_at + interval '30 days') as back30,
           exists (select 1 from issue_signals isg join signals s on s.id = isg.signal_id
                   where isg.issue_id = c.issue_id and s.source in ${LIVE}
                     and s.occurred_at > c.closed_at and s.occurred_at <= c.closed_at + interval '90 days') as back90
    from c where ${within(sql`c.closed_at`)}
  `);
  return rows.map((r) => ({ ...r }));
}

async function ticketRows(tx: Tx, within: Within, month: Month, start: SQL, end: SQL) {
  const rows = await tx.execute<{ category: string; month: string; hours: number; first_half: boolean }>(sql`
    select coalesce(i.category, 'unclassified') as category, ${month(sql`a.performed_at`)} as month,
           (extract(epoch from ((a.details->>'closed_at')::timestamptz - a.performed_at)) / 3600)::float as hours,
           a.performed_at < (${start} + (${end} - ${start}) / 2) as first_half
    from actions a join issues i on i.id = a.issue_id
    where a.kind = 'ticket_created' and a.details->>'closed_at' is not null and ${within(sql`a.performed_at`)}
  `);
  return rows.map((r) => ({ ...r }));
}

async function recurredOutcomes(tx: Tx, within: Within) {
  const [r] = await tx.execute<{ n: number }>(sql`
    select count(*)::int as n from outcomes where kind = 'recurred' and ${within(sql`observed_at`)}
  `);
  return r?.n ?? 0;
}

async function guestVoiceBySource(tx: Tx, within: Within) {
  const rows = await tx.execute<{ source: string; with_topic: number; linked: number; with_ticket: number }>(sql`
    select s.source::text as source,
           count(*) filter (where s.category is not null)::int as with_topic,
           count(*) filter (where s.category is not null
             and exists (select 1 from issue_signals isg where isg.signal_id = s.id))::int as linked,
           count(*) filter (where s.category is not null
             and exists (select 1 from issue_signals isg join actions a on a.issue_id = isg.issue_id where isg.signal_id = s.id))::int as with_ticket
    from signals s
    where s.source in ('front_desk', 'survey', 'review') and ${within(sql`s.occurred_at`)}
    group by 1 order by 1
  `);
  return rows.map((r) => ({ ...r }));
}

async function guestVoiceByTopic(tx: Tx, within: Within) {
  const rows = await tx.execute<{ topic: string; category: string | null; mentions: number; linked: number; with_ticket: number; avg_score: number | null }>(sql`
    select s.topic, min(s.category) as category, count(*)::int as mentions,
           count(*) filter (where exists (select 1 from issue_signals isg where isg.signal_id = s.id))::int as linked,
           count(*) filter (where exists (select 1 from issue_signals isg join actions a on a.issue_id = isg.issue_id where isg.signal_id = s.id))::int as with_ticket,
           avg(case when s.source = 'survey' then nullif(s.raw->>'overall', '')::numeric
                    else coalesce(nullif(s.raw->>'score', '')::numeric, nullif(s.raw->>'rating', '')::numeric * 2) end)::float as avg_score
    from signals s
    where s.source in ('survey', 'review') and s.topic is not null and ${within(sql`s.occurred_at`)}
    group by s.topic order by mentions desc limit 15
  `);
  return rows.map((r) => ({ ...r }));
}

async function unticketedExamples(tx: Tx, within: Within) {
  const rows = await tx.execute<{ topic: string; source: string; occurred_at: Date; text: string | null }>(sql`
    select topic, source::text as source, occurred_at, coalesce(text_en, text_original) as text
    from (
      select s.topic, s.source, s.occurred_at, s.text_en, s.text_original,
             row_number() over (partition by s.topic order by s.occurred_at) as rn
      from signals s
      where s.source in ('survey', 'review') and s.topic is not null and ${within(sql`s.occurred_at`)}
        and not exists (select 1 from issue_signals isg join actions a on a.issue_id = isg.issue_id where isg.signal_id = s.id)
    ) x where rn <= 2
  `);
  return rows.map((r) => ({ ...r }));
}

async function surveyScores(tx: Tx, within: Within) {
  const rows = await tx.execute<{ linked: boolean; responses: number; avg_overall: number | null; avg_nps: number | null; recommend_share: number | null }>(sql`
    select exists (select 1 from issue_signals isg where isg.signal_id = s.id) as linked,
           count(*)::int as responses,
           avg(nullif(s.raw->>'overall', '')::numeric)::float as avg_overall,
           avg(nullif(s.raw->>'nps', '')::numeric)::float as avg_nps,
           ((count(*) filter (where s.raw->>'would_recommend' = 'Yes'))::float
             / nullif(count(*) filter (where s.raw->>'would_recommend' in ('Yes', 'No')), 0)) as recommend_share
    from signals s where s.source = 'survey' and ${within(sql`s.occurred_at`)}
    group by 1
  `);
  return rows.map((r) => ({ ...r }));
}

async function recordsMetrics(tx: Tx, within: Within): Promise<RecordsRow> {
  const [r] = await tx.execute<RecordsRow>(sql`
    select
      count(*) filter (where source = 'work_order')::int as wo,
      count(*) filter (where source = 'work_order' and coalesce(raw->>'Closed', '') <> '')::int as wo_closed,
      count(*) filter (where source = 'work_order' and coalesce(raw->>'Closed', '') <> ''
        and (coalesce(raw->>'Closure Note', '') = ''
             or lower(trim(raw->>'Closure Note')) in ('done', 'done.', 'ok', 'ok.', 'okay', 'fixed', 'έγινε', 'εγινε', 'egine', 'ola kala')))::int as wo_note_trivial,
      count(*) filter (where source = 'work_order' and raw->>'Category' = 'Other')::int as wo_other,
      count(*) filter (where source = 'work_order' and location_id is not null)::int as wo_located,
      count(distinct raw->>'Status') filter (where source = 'work_order')::int as wo_status_values,
      count(*) filter (where source = 'work_order' and coalesce(raw->>'Closed', '') = ''
        and lower(coalesce(raw->>'Status', '')) in ('closed', 'completed', 'done'))::int as wo_status_mismatch,
      count(*) filter (where source = 'front_desk')::int as fd,
      count(*) filter (where source = 'front_desk' and location_id is not null)::int as fd_located,
      count(*) filter (where source = 'front_desk' and coalesce(raw->>'Agent note', '') <> '')::int as fd_note,
      count(*) filter (where source = 'front_desk' and category is not null and category not in ('request', 'service'))::int as fd_defects,
      count(*) filter (where source = 'front_desk' and category is not null and category not in ('request', 'service')
        and exists (select 1 from issue_signals isg join actions a on a.issue_id = isg.issue_id where isg.signal_id = signals.id))::int as fd_ticketed,
      count(*) filter (where source = 'survey')::int as sv,
      count(*) filter (where source = 'survey' and text_original is not null)::int as sv_comment,
      count(*) filter (where source = 'survey' and text_original is not null and stay_ref is not null)::int as sv_stay,
      count(*) filter (where source = 'review')::int as rv,
      count(*) filter (where source = 'review' and location_id is not null)::int as rv_located,
      count(*) filter (where source in ('work_order', 'front_desk', 'survey', 'review') and text_original is not null)::int as texts,
      count(*) filter (where source in ('work_order', 'front_desk', 'survey', 'review') and text_original is not null
        and language is not null and language <> 'en')::int as texts_non_en
    from signals where ${within(sql`occurred_at`)}
  `);
  return r;
}

// ---------------------------------------------------------------------------

function evidenceLine(f: RecurringFailure, tz: string): string {
  const d = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "2-digit", month: "short" }).format(new Date(iso));
  const where = f.locationCode ? `${f.locationCode}${f.locationKind ? ` (${f.locationKind})` : ""}` : "no fixed location";
  const n = (k: number, w: string) => `${k} ${w}${k === 1 ? "" : "s"}`;
  return [
    `${topicLabel(f.topic, f.category)} at ${where}`,
    `${n(f.episodes, "episode")}, ${n(f.reopens, "reopen")}, ${n(f.closures, "closure")}, ${n(f.repeatTickets, "repeat ticket")}`,
    f.roomsAffected ? `${n(f.roomsAffected, "room")} affected` : null,
    `${n(f.guestReports, "guest report")} (${f.deskComplaints} at the desk, ${f.surveyMentions} in surveys, ${f.reviewMentions} in reviews)`,
    `${d(f.firstAt)} → ${d(f.lastAt)}`,
  ]
    .filter(Boolean)
    .join("; ");
}

function groupBy<T>(rows: T[], key: (r: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = m.get(k);
    if (list) list.push(r);
    else m.set(k, [r]);
  }
  return [...m];
}

/** Linear-interpolated quantile, like percentile_cont. null when empty. */
export function quantile(values: number[], q: number): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const v = lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (pos - lo);
  return round(v, 1);
}

export function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}
