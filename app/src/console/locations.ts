import { sql } from "drizzle-orm";
import { withTenant, type Db, type TenantContext } from "@/db";
import { ACTIONABLE_SOURCES } from "@/link/types";

/**
 * Where the problems are: the location tree with issue counts, one place
 * with its history, and the typed location strings the engine could not
 * resolve. All reads; the writes are in location-admin.ts.
 */
export type Counts = { open: number; recurring: number; total: number };

export type TreeNode = {
  id: string;
  code: string;
  name: string;
  kind: string;
  parentId: string | null;
  aliases: string[];
  counts: Counts;
  /** Counts including every descendant. */
  below: Counts;
  children: TreeNode[];
  /** For equipment: codes of what it serves. */
  serves: string[];
};

export type LocationTree = {
  propertyName: string;
  buildings: TreeNode[];
  facilities: TreeNode[];
  equipment: TreeNode[];
  byId: Map<string, TreeNode>;
};

const OPEN_STATUSES = sql`('detected', 'assigned', 'reopened', 'resolved')`;

type CountRow = { id: string; code: string; name: string; kind: string; parent_id: string | null; aliases: string[]; open: number; recurring: number; total: number };

async function loadCounts(tx: Parameters<Parameters<typeof withTenant>[2]>[0]): Promise<CountRow[]> {
  return tx.execute<CountRow>(sql`
    select l.id, l.code, l.name, l.kind::text as kind, l.parent_id, l.aliases,
           count(i.id) filter (where i.status in ${OPEN_STATUSES})::int as open,
           count(i.id) filter (where i.reopen_count > 0)::int as recurring,
           count(i.id)::int as total
    from locations l
    left join issues i on i.location_id = l.id and i.superseded_at is null
    group by l.id
    order by l.kind, l.code
  `);
}

export async function getLocationTree(db: Db, ctx: TenantContext): Promise<LocationTree> {
  return withTenant(db, ctx, async (tx) => {
    const rows = await loadCounts(tx);
    const serves = await tx.execute<{ equipment_id: string; code: string }>(sql`
      select ll.equipment_id, l.code from location_links ll join locations l on l.id = ll.serves_id order by l.code
    `);
    const servesBy = new Map<string, string[]>();
    for (const s of serves) servesBy.set(s.equipment_id, [...(servesBy.get(s.equipment_id) ?? []), s.code]);
    const byId = new Map<string, TreeNode>();
    for (const r of rows) {
      byId.set(r.id, {
        id: r.id,
        code: r.code,
        name: r.name,
        kind: r.kind,
        parentId: r.parent_id,
        aliases: r.aliases ?? [],
        counts: { open: r.open, recurring: r.recurring, total: r.total },
        below: { open: r.open, recurring: r.recurring, total: r.total },
        children: [],
        serves: servesBy.get(r.id) ?? [],
      });
    }
    for (const n of byId.values()) {
      if (n.parentId && byId.has(n.parentId) && (n.kind === "building" || n.kind === "floor" || n.kind === "room")) byId.get(n.parentId)!.children.push(n);
    }
    const sortNodes = (nodes: TreeNode[]) => {
      nodes.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
      for (const n of nodes) sortNodes(n.children);
    };
    const roll = (n: TreeNode): Counts => {
      for (const c of n.children) {
        const b = roll(c);
        n.below = { open: n.below.open + b.open, recurring: n.below.recurring + b.recurring, total: n.below.total + b.total };
      }
      return n.below;
    };
    const buildings = [...byId.values()].filter((n) => n.kind === "building");
    sortNodes(buildings);
    for (const b of buildings) roll(b);
    const facilities = [...byId.values()].filter((n) => n.kind === "facility");
    const equipment = [...byId.values()].filter((n) => n.kind === "equipment");
    sortNodes(facilities);
    sortNodes(equipment);
    const property = [...byId.values()].find((n) => n.kind === "property");
    return { propertyName: property?.name ?? "", buildings, facilities, equipment, byId };
  });
}

export type PlaceRef = { id: string; code: string; name: string; kind: string };

export type LocationDetail = {
  id: string;
  code: string;
  name: string;
  kind: string;
  parentId: string | null;
  attributes: Record<string, unknown>;
  aliases: string[];
  /** Ancestors, nearest first (excluding the property root). */
  chain: PlaceRef[];
  servedBy: PlaceRef[];
  serves: PlaceRef[];
  children: (PlaceRef & { counts: Counts })[];
  counts: Counts;
  below: Counts;
  descendantIds: string[];
};

export async function getLocationByCode(db: Db, ctx: TenantContext, code: string): Promise<LocationDetail | null> {
  return withTenant(db, ctx, async (tx) => {
    const [l] = await tx.execute<{ id: string; code: string; name: string; kind: string; parent_id: string | null; attributes: Record<string, unknown>; aliases: string[] }>(sql`
      select id, code, name, kind::text as kind, parent_id, attributes, aliases from locations where code = ${code}
    `);
    if (!l) return null;
    const chain = await tx.execute<PlaceRef & { depth: number }>(sql`
      with recursive up as (
        select p.id, p.code, p.name, p.kind::text as kind, p.parent_id, 1 as depth from locations p where p.id = ${l.parent_id}::uuid
        union all
        select p.id, p.code, p.name, p.kind::text, p.parent_id, u.depth + 1 from locations p join up u on u.parent_id = p.id
      )
      select id, code, name, kind, depth from up where kind <> 'property' order by depth
    `);
    const descendants = await tx.execute<{ id: string }>(sql`
      with recursive down as (
        select id from locations where id = ${l.id}
        union all
        select c.id from locations c join down d on c.parent_id = d.id
      )
      select id from down
    `);
    const ids = descendants.map((d) => d.id);
    const chainIds = [l.id, ...chain.map((c) => c.id)];
    const servedBy = await tx.execute<PlaceRef>(sql`
      select distinct e.id, e.code, e.name, e.kind::text as kind
      from location_links ll join locations e on e.id = ll.equipment_id
      where ll.serves_id in (${sql.join(chainIds.map((id) => sql`${id}`), sql`, `)}) and e.id <> ${l.id}
      order by e.code
    `);
    const serves = await tx.execute<PlaceRef>(sql`
      select s.id, s.code, s.name, s.kind::text as kind from location_links ll join locations s on s.id = ll.serves_id where ll.equipment_id = ${l.id} order by s.code
    `);
    const children = await tx.execute<PlaceRef & { open: number; recurring: number; total: number }>(sql`
      select c.id, c.code, c.name, c.kind::text as kind,
             count(i.id) filter (where i.status in ${OPEN_STATUSES})::int as open,
             count(i.id) filter (where i.reopen_count > 0)::int as recurring,
             count(i.id)::int as total
      from locations c left join issues i on i.location_id = c.id and i.superseded_at is null
      where c.parent_id = ${l.id}
      group by c.id order by c.code
    `);
    const [counts] = await tx.execute<{ open: number; recurring: number; total: number; open_below: number; recurring_below: number; total_below: number }>(sql`
      select count(i.id) filter (where i.location_id = ${l.id} and i.status in ${OPEN_STATUSES})::int as open,
             count(i.id) filter (where i.location_id = ${l.id} and i.reopen_count > 0)::int as recurring,
             count(i.id) filter (where i.location_id = ${l.id})::int as total,
             count(i.id) filter (where i.status in ${OPEN_STATUSES})::int as open_below,
             count(i.id) filter (where i.reopen_count > 0)::int as recurring_below,
             count(i.id)::int as total_below
      from issues i where i.superseded_at is null and i.location_id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
    `);
    return {
      id: l.id,
      code: l.code,
      name: l.name,
      kind: l.kind,
      parentId: l.parent_id,
      attributes: l.attributes ?? {},
      aliases: l.aliases ?? [],
      chain: chain.map((c) => ({ id: c.id, code: c.code, name: c.name, kind: c.kind })),
      servedBy: servedBy.map((r) => ({ ...r })),
      serves: serves.map((r) => ({ ...r })),
      children: children.map((c) => ({ id: c.id, code: c.code, name: c.name, kind: c.kind, counts: { open: c.open, recurring: c.recurring, total: c.total } })),
      counts: { open: counts?.open ?? 0, recurring: counts?.recurring ?? 0, total: counts?.total ?? 0 },
      below: { open: counts?.open_below ?? 0, recurring: counts?.recurring_below ?? 0, total: counts?.total_below ?? 0 },
      descendantIds: ids,
    };
  });
}

export type LocationIssue = {
  id: string;
  title: string;
  status: string;
  category: string | null;
  reopenCount: number;
  signals: number;
  locationCode: string | null;
  openedAt: Date;
  lastAt: Date | null;
};

export async function listIssuesAtLocation(db: Db, ctx: TenantContext, p: { ids: string[]; page?: number; pageSize?: number }): Promise<{ rows: LocationIssue[]; total: number; page: number; pageSize: number }> {
  const pageSize = p.pageSize ?? 25;
  const page = Math.max(1, p.page ?? 1);
  if (!p.ids.length) return { rows: [], total: 0, page, pageSize };
  return withTenant(db, ctx, async (tx) => {
    const rows = await tx.execute<{ id: string; title: string; status: string; category: string | null; reopen_count: number; signals: number; location_code: string | null; opened_at: Date; last_at: Date | null; total: number }>(sql`
      select i.id, i.title, i.status::text as status, i.category, i.reopen_count, l.code as location_code, i.opened_at,
             s.n as signals, s.last_at, count(*) over ()::int as total
      from issues i
      left join locations l on l.id = i.location_id
      join lateral (select count(*)::int as n, max(sg.occurred_at) as last_at from issue_signals x join signals sg on sg.id = x.signal_id where x.issue_id = i.id) s on true
      where i.superseded_at is null and i.location_id in (${sql.join(p.ids.map((id) => sql`${id}`), sql`, `)})
      order by i.reopen_count desc, s.last_at desc nulls last
      limit ${pageSize} offset ${(page - 1) * pageSize}
    `);
    return {
      page,
      pageSize,
      total: rows[0]?.total ?? 0,
      rows: rows.map((r) => ({ id: r.id, title: r.title, status: r.status, category: r.category, reopenCount: r.reopen_count, signals: r.signals, locationCode: r.location_code, openedAt: new Date(r.opened_at), lastAt: r.last_at ? new Date(r.last_at) : null })),
    };
  });
}

export type LooseSignal = { id: string; source: string; externalId: string; occurredAt: Date; topic: string | null; category: string | null; text: string | null; locationCode: string | null };

/** Records at the place that name a problem but sit in no issue. */
export async function listUnlinkedSignalsAtLocation(db: Db, ctx: TenantContext, ids: string[], limit = 20): Promise<{ rows: LooseSignal[]; total: number }> {
  if (!ids.length) return { rows: [], total: 0 };
  return withTenant(db, ctx, async (tx) => {
    const rows = await tx.execute<{ id: string; source: string; external_id: string; occurred_at: Date; topic: string | null; category: string | null; text: string | null; location_code: string | null; total: number }>(sql`
      select s.id, s.source::text as source, s.external_id, s.occurred_at, s.topic, s.category, coalesce(s.text_en, s.text_original) as text, l.code as location_code,
             count(*) over ()::int as total
      from signals s left join locations l on l.id = s.location_id
      where s.location_id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
        and s.category is not null and s.category not in ('preventive', 'request')
        and s.source in (${sql.join(ACTIONABLE_SOURCES.map((x) => sql`${x}`), sql`, `)})
        and not exists (select 1 from issue_signals x where x.signal_id = s.id)
      order by s.occurred_at desc
      limit ${limit}
    `);
    return { total: rows[0]?.total ?? 0, rows: rows.map((r) => ({ id: r.id, source: r.source, externalId: r.external_id, occurredAt: new Date(r.occurred_at), topic: r.topic, category: r.category, text: r.text, locationCode: r.location_code })) };
  });
}

/** What staff typed for a place that nothing resolved, grouped and counted. */
export type Spelling = { typed: string; count: number; sources: string[]; lastAt: Date; sample: string | null };

export const TYPED_LOCATION = sql`coalesce(nullif(s.mapped->>'location', ''), nullif(s.raw->>'Location', ''), nullif(s.raw->>'Room', ''))`;

export async function listUnresolvedSpellings(db: Db, ctx: TenantContext, limit = 200): Promise<Spelling[]> {
  return withTenant(db, ctx, async (tx) => {
    const rows = await tx.execute<{ typed: string; count: number; sources: string[]; last_at: Date; sample: string | null }>(sql`
      select ${TYPED_LOCATION} as typed, count(*)::int as count, array_agg(distinct s.source::text) as sources, max(s.occurred_at) as last_at,
             (array_agg(coalesce(s.text_en, s.text_original) order by s.occurred_at desc))[1] as sample
      from signals s
      where s.location_method = 'none' and s.location_id is null and s.source in ('work_order', 'front_desk', 'staff_report', 'guest_qr')
        and ${TYPED_LOCATION} is not null
      group by 1
      order by count desc, last_at desc
      limit ${limit}
    `);
    return rows.map((r) => ({ typed: r.typed, count: r.count, sources: r.sources, lastAt: new Date(r.last_at), sample: r.sample }));
  });
}
