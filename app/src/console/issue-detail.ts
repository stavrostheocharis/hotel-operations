import { sql } from "drizzle-orm";
import { withTenant, type Db, type TenantContext } from "@/db";

/**
 * The rest of an issue page: who did what (events, with names), where the
 * issue sits (the location's ancestors, what serves it or what it serves),
 * what else happened at that place, and who can be assigned.
 */
export type IssueEvent = {
  id: string;
  type: string;
  actor: string;
  actorName: string | null;
  payload: Record<string, unknown>;
  occurredAt: Date;
};

export type PlaceRef = { id: string; code: string; name: string; kind: string };

export type RelatedIssue = { id: string; title: string; status: string; reopenCount: number; openedAt: Date; lastAt: Date | null };

export type IssueContext = {
  events: IssueEvent[];
  /** The issue's location and its ancestors, nearest first. */
  chain: PlaceRef[];
  /** Equipment serving the location or one of its ancestors. */
  servedBy: PlaceRef[];
  /** For equipment: what it serves. */
  serves: PlaceRef[];
  related: RelatedIssue[];
};

export async function getIssueContext(db: Db, ctx: TenantContext, issueId: string, locationId: string | null): Promise<IssueContext> {
  return withTenant(db, ctx, async (tx) => {
    const events = await tx.execute<{ id: string; type: string; actor: string; actor_name: string | null; payload: Record<string, unknown>; occurred_at: Date }>(sql`
      select e.id, e.type, e.actor, u.name as actor_name, e.payload, e.occurred_at
      from events e left join users u on u.id::text = e.actor
      where e.entity_type = 'issue' and e.entity_id = ${issueId}
      order by e.occurred_at desc, e.id desc
      limit 200
    `);
    let chain: PlaceRef[] = [];
    let servedBy: PlaceRef[] = [];
    let serves: PlaceRef[] = [];
    let related: RelatedIssue[] = [];
    if (locationId) {
      chain = (
        await tx.execute<{ id: string; code: string; name: string; kind: string }>(sql`
          with recursive chain as (
            select l.id, l.code, l.name, l.kind::text as kind, l.parent_id, 0 as depth from locations l where l.id = ${locationId}
            union all
            select p.id, p.code, p.name, p.kind::text, p.parent_id, c.depth + 1 from locations p join chain c on c.parent_id = p.id
          )
          select id, code, name, kind from chain order by depth
        `)
      ).map((r) => ({ id: r.id, code: r.code, name: r.name, kind: r.kind }));
      const chainIds = chain.map((c) => c.id);
      servedBy = (
        await tx.execute<{ id: string; code: string; name: string; kind: string }>(sql`
          select distinct l.id, l.code, l.name, l.kind::text as kind
          from location_links ll join locations l on l.id = ll.equipment_id
          where ll.serves_id in (${sql.join(chainIds.map((id) => sql`${id}`), sql`, `)}) and l.id <> ${locationId}
          order by l.code
        `)
      ).map((r) => ({ id: r.id, code: r.code, name: r.name, kind: r.kind }));
      serves = (
        await tx.execute<{ id: string; code: string; name: string; kind: string }>(sql`
          select l.id, l.code, l.name, l.kind::text as kind
          from location_links ll join locations l on l.id = ll.serves_id
          where ll.equipment_id = ${locationId}
          order by l.code
        `)
      ).map((r) => ({ id: r.id, code: r.code, name: r.name, kind: r.kind }));
      related = (
        await tx.execute<{ id: string; title: string; status: string; reopen_count: number; opened_at: Date; last_at: Date | null }>(sql`
          select i.id, i.title, i.status, i.reopen_count, i.opened_at,
                 (select max(s.occurred_at) from issue_signals x join signals s on s.id = x.signal_id where x.issue_id = i.id) as last_at
          from issues i
          where i.location_id = ${locationId} and i.id <> ${issueId} and i.superseded_at is null
          order by i.reopen_count desc, i.opened_at desc
          limit 5
        `)
      ).map((r) => ({ id: r.id, title: r.title, status: r.status, reopenCount: r.reopen_count, openedAt: new Date(r.opened_at), lastAt: r.last_at ? new Date(r.last_at) : null }));
    }
    return {
      events: events.map((e) => ({ id: e.id, type: e.type, actor: e.actor, actorName: e.actor_name, payload: e.payload ?? {}, occurredAt: new Date(e.occurred_at) })),
      chain,
      servedBy,
      serves,
      related,
    };
  });
}

export type AssignableUser = { id: string; name: string; role: string; department: string | null };

/** People who can be given an issue: every active member of the property, plus the group's admins. */
export async function listAssignableUsers(db: Db, ctx: TenantContext, propertyId: string): Promise<AssignableUser[]> {
  return withTenant(db, ctx, async (tx) => {
    const rows = await tx.execute<{ id: string; name: string; role: string; department: string | null }>(sql`
      select distinct u.id, u.name, u.role::text as role, u.department::text as department
      from users u
      left join memberships m on m.user_id = u.id and m.property_id = ${propertyId}
      where u.is_active and u.role <> 'readonly' and (m.id is not null or u.role = 'group_admin')
      order by u.name
    `);
    return rows.map((r) => ({ ...r }));
  });
}
