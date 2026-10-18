import { sql, type SQL } from "drizzle-orm";
import { withTenant, type Db, type TenantContext } from "@/db";

/**
 * "Are we getting better month by month?" One table, months as rows, the
 * same definitions as the season audit (`src/audit/report.ts`): records,
 * issues opened, reopened, repeats per 1,000 occupied room-nights, ticket
 * closures that held 30 days, median hours to close, verified, closed
 * without verification. Plus the same measures per category.
 */
export type MonthRow = {
  month: string;
  records: number;
  issuesOpened: number;
  reopened: number;
  repeats: number;
  roomNights: number;
  repeatsPerThousandRoomNights: number | null;
  closures: number;
  held30: number;
  held30Share: number | null;
  medianHours: number | null;
  verified: number;
  closedUnverified: number;
};

export type CategoryRow = {
  category: string;
  issues: number;
  reopened: number;
  repeats: number;
  closures: number;
  held30: number;
  held30Share: number | null;
  medianHours: number | null;
};

export type MonthlyReport = {
  property: { code: string; name: string; timezone: string };
  season: { from: string; to: string };
  months: MonthRow[];
  totals: MonthRow;
  byCategory: CategoryRow[];
  generatedAt: string;
};

const LIVE = sql`('front_desk', 'work_order', 'staff_report', 'guest_qr', 'compensation')`;

export async function buildMonthlyReport(db: Db, ctx: TenantContext, opts: { from?: string; to?: string } = {}): Promise<MonthlyReport> {
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
    const start = sql`((${from}::date)::timestamp at time zone ${tz})`;
    const end = sql`(((${to}::date) + 1)::timestamp at time zone ${tz})`;
    const within = (col: SQL) => sql`(${col} >= ${start} and ${col} < ${end})`;
    const month = (col: SQL) => sql`to_char(${col} at time zone ${tz}, 'YYYY-MM')`;

    type MN = { month: string; n: number };
    const [records, opened, reopened, repeats, roomNights, closures, verified, closedUnverified, catIssues, catRepeats, catClosures] = await Promise.all([
      tx.execute<MN>(sql`select ${month(sql`occurred_at`)} as month, count(*)::int as n from signals where source <> 'pms' and ${within(sql`occurred_at`)} group by 1`),
      tx.execute<MN>(sql`select ${month(sql`opened_at`)} as month, count(*)::int as n from issues where superseded_at is null and ${within(sql`opened_at`)} group by 1`),
      tx.execute<MN>(sql`select ${month(sql`occurred_at`)} as month, count(*)::int as n from events where type = 'issue.reopened' and ${within(sql`occurred_at`)} group by 1`),
      tx.execute<MN>(sql`select ${month(sql`observed_at`)} as month, count(*)::int as n from outcomes where kind = 'recurred' and ${within(sql`observed_at`)} group by 1`),
      tx.execute<MN>(sql`select to_char(day, 'YYYY-MM') as month, coalesce(sum(rooms_occupied), 0)::int as n from occupancy_daily where day >= ${from}::date and day <= ${to}::date group by 1`),
      tx.execute<{ month: string; category: string; back30: boolean; hours: number }>(sql`
        with c as (
          select a.issue_id, a.performed_at, (a.details->>'closed_at')::timestamptz as closed_at, coalesce(i.category, 'unclassified') as category
          from actions a join issues i on i.id = a.issue_id
          where a.kind = 'ticket_created' and a.details->>'closed_at' is not null
        )
        select ${month(sql`c.closed_at`)} as month, c.category,
               exists (select 1 from issue_signals isg join signals s on s.id = isg.signal_id
                       where isg.issue_id = c.issue_id and s.source in ${LIVE}
                         and s.occurred_at > c.closed_at and s.occurred_at <= c.closed_at + interval '30 days') as back30,
               (extract(epoch from (c.closed_at - c.performed_at)) / 3600)::float as hours
        from c where ${within(sql`c.closed_at`)}
      `),
      tx.execute<MN>(sql`select ${month(sql`verified_at`)} as month, count(*)::int as n from issues where superseded_at is null and verified_at is not null and ${within(sql`verified_at`)} group by 1`),
      tx.execute<MN>(sql`select ${month(sql`resolved_at`)} as month, count(*)::int as n from issues where superseded_at is null and status = 'closed_unverified' and resolved_at is not null and ${within(sql`resolved_at`)} group by 1`),
      tx.execute<{ category: string; issues: number; reopened: number }>(sql`
        select coalesce(category, 'unclassified') as category, count(*)::int as issues, count(*) filter (where reopen_count > 0)::int as reopened
        from issues where superseded_at is null and ${within(sql`opened_at`)} group by 1
      `),
      tx.execute<{ category: string; n: number }>(sql`
        select coalesce(i.category, 'unclassified') as category, count(*)::int as n
        from outcomes o join issues i on i.id = o.issue_id where o.kind = 'recurred' and ${within(sql`o.observed_at`)} group by 1
      `),
      Promise.resolve(null),
    ]);
    void catClosures;

    const by = (rows: MN[]) => new Map(rows.map((r) => [r.month, Number(r.n)]));
    const m = { records: by(records), opened: by(opened), reopened: by(reopened), repeats: by(repeats), roomNights: by(roomNights), verified: by(verified), closedUnverified: by(closedUnverified) };
    const closureByMonth = new Map<string, { closures: number; back30: number; hours: number[] }>();
    const closureByCategory = new Map<string, { closures: number; back30: number; hours: number[] }>();
    for (const c of closures) {
      for (const [key, map] of [
        [c.month, closureByMonth],
        [c.category, closureByCategory],
      ] as const) {
        const e = map.get(key) ?? { closures: 0, back30: 0, hours: [] };
        e.closures++;
        if (c.back30) e.back30++;
        e.hours.push(Number(c.hours));
        map.set(key, e);
      }
    }

    const months: MonthRow[] = [];
    for (const key of monthsBetween(from, to)) {
      const c = closureByMonth.get(key) ?? { closures: 0, back30: 0, hours: [] };
      months.push(monthRow(key, { records: m.records.get(key) ?? 0, issuesOpened: m.opened.get(key) ?? 0, reopened: m.reopened.get(key) ?? 0, repeats: m.repeats.get(key) ?? 0, roomNights: m.roomNights.get(key) ?? 0, closures: c.closures, back30: c.back30, hours: c.hours, verified: m.verified.get(key) ?? 0, closedUnverified: m.closedUnverified.get(key) ?? 0 }));
    }
    const sum = (f: (r: MonthRow) => number) => months.reduce((n, r) => n + f(r), 0);
    const totals = monthRow("total", {
      records: sum((r) => r.records),
      issuesOpened: sum((r) => r.issuesOpened),
      reopened: sum((r) => r.reopened),
      repeats: sum((r) => r.repeats),
      roomNights: sum((r) => r.roomNights),
      closures: closures.length,
      back30: closures.filter((c) => c.back30).length,
      hours: closures.map((c) => Number(c.hours)),
      verified: sum((r) => r.verified),
      closedUnverified: sum((r) => r.closedUnverified),
    });

    const repeatsByCat = new Map(catRepeats.map((r) => [r.category, Number(r.n)]));
    const byCategory: CategoryRow[] = catIssues
      .map((r) => {
        const c = closureByCategory.get(r.category) ?? { closures: 0, back30: 0, hours: [] };
        return {
          category: r.category,
          issues: Number(r.issues),
          reopened: Number(r.reopened),
          repeats: repeatsByCat.get(r.category) ?? 0,
          closures: c.closures,
          held30: c.closures - c.back30,
          held30Share: c.closures ? (c.closures - c.back30) / c.closures : null,
          medianHours: median(c.hours),
        };
      })
      .sort((a, b) => b.repeats - a.repeats || b.reopened - a.reopened || b.issues - a.issues);

    return { property: { code: p.code, name: p.name, timezone: tz }, season: { from, to }, months, totals, byCategory, generatedAt: new Date().toISOString() };
  });
}

function monthRow(month: string, v: { records: number; issuesOpened: number; reopened: number; repeats: number; roomNights: number; closures: number; back30: number; hours: number[]; verified: number; closedUnverified: number }): MonthRow {
  return {
    month,
    records: v.records,
    issuesOpened: v.issuesOpened,
    reopened: v.reopened,
    repeats: v.repeats,
    roomNights: v.roomNights,
    repeatsPerThousandRoomNights: v.roomNights ? (1000 * v.repeats) / v.roomNights : null,
    closures: v.closures,
    held30: v.closures - v.back30,
    held30Share: v.closures ? (v.closures - v.back30) / v.closures : null,
    medianHours: median(v.hours),
    verified: v.verified,
    closedUnverified: v.closedUnverified,
  };
}

export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, mo] = from.slice(0, 7).split("-").map(Number);
  const [ty, tmo] = to.slice(0, 7).split("-").map(Number);
  while (y < ty || (y === ty && mo <= tmo)) {
    out.push(`${y}-${String(mo).padStart(2, "0")}`);
    mo++;
    if (mo > 12) {
      mo = 1;
      y++;
    }
    if (out.length > 120) break;
  }
  return out;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Semicolon-separated with a BOM, so Greek-locale Excel opens it as columns. */
export function renderMonthlyCsv(r: MonthlyReport): string {
  const head = ["month", "records", "issues_opened", "reopened", "repeats", "room_nights", "repeats_per_1000_room_nights", "closures", "held_30d", "held_30d_share", "median_hours_to_close", "verified", "closed_unverified"];
  const row = (x: MonthRow) => [x.month, x.records, x.issuesOpened, x.reopened, x.repeats, x.roomNights, num(x.repeatsPerThousandRoomNights, 2), x.closures, x.held30, num(x.held30Share, 3), num(x.medianHours, 1), x.verified, x.closedUnverified];
  const lines = [head, ...r.months.map(row), row({ ...r.totals, month: "season" })];
  lines.push([], ["category", "issues", "reopened", "repeats", "closures", "held_30d", "held_30d_share", "median_hours_to_close"]);
  for (const c of r.byCategory) lines.push([c.category, c.issues, c.reopened, c.repeats, c.closures, c.held30, num(c.held30Share, 3), num(c.medianHours, 1)]);
  return "﻿" + lines.map((l) => l.map((v) => String(v ?? "")).join(";")).join("\r\n") + "\r\n";
}

const num = (n: number | null, digits: number) => (n === null ? "" : n.toFixed(digits));
