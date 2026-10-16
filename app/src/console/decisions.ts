import { and, eq, sql } from "drizzle-orm";
import { schema, withTenant, type Db, type TenantContext } from "@/db";

/**
 * A supervisor's verdict on a link the engine proposed. Confirm pins the
 * signal to the issue's primary signal; reject removes it from the issue and
 * pins it away from every current member, so the next rebuild keeps the
 * decision. Both write an event with the person as actor.
 */
export type LinkDecisionInput = {
  issueId: string;
  signalId: string;
  decision: "confirm" | "reject";
  decidedBy: string;
  note?: string;
};

export type LinkDecisionResult = { pinned: number; removed: boolean };

export async function applyLinkDecision(db: Db, ctx: TenantContext, input: LinkDecisionInput): Promise<LinkDecisionResult> {
  return withTenant(db, ctx, async (tx) => {
    const members = await tx
      .select({
        signalId: schema.issueSignals.signalId,
        role: schema.issueSignals.role,
        groupId: schema.issueSignals.groupId,
        propertyId: schema.issueSignals.propertyId,
      })
      .from(schema.issueSignals)
      .where(eq(schema.issueSignals.issueId, input.issueId));
    const me = members.find((m) => m.signalId === input.signalId);
    if (!me) throw new Error("signal is not part of this issue");
    const tenant = { groupId: me.groupId, propertyId: me.propertyId };
    const others = members.filter((m) => m.signalId !== input.signalId);
    const primary = members.find((m) => m.role === "primary") ?? others[0];
    const now = new Date();

    const pin = async (other: string, decision: "link" | "unlink") => {
      const [a, b] = other < input.signalId ? [other, input.signalId] : [input.signalId, other];
      await tx
        .insert(schema.linkDecisions)
        .values({ ...tenant, signalA: a, signalB: b, decision, decidedBy: input.decidedBy, note: input.note ?? null })
        .onConflictDoUpdate({
          target: [schema.linkDecisions.propertyId, schema.linkDecisions.signalA, schema.linkDecisions.signalB],
          set: { decision, decidedBy: input.decidedBy, note: input.note ?? null, createdAt: now },
        });
    };

    if (input.decision === "confirm") {
      await tx
        .update(schema.issueSignals)
        .set({ method: "human", confidence: "1.000", decidedBy: input.decidedBy, decidedAt: now, evidence: sql`${schema.issueSignals.evidence} || '{"confirmed": true}'::jsonb` })
        .where(and(eq(schema.issueSignals.issueId, input.issueId), eq(schema.issueSignals.signalId, input.signalId)));
      let pinned = 0;
      if (primary && primary.signalId !== input.signalId) {
        await pin(primary.signalId, "link");
        pinned = 1;
      }
      await tx.insert(schema.events).values({
        ...tenant,
        entityType: "issue",
        entityId: input.issueId,
        type: "issue.link_confirmed",
        actor: input.decidedBy,
        payload: { signal_id: input.signalId, note: input.note ?? null },
      });
      return { pinned, removed: false };
    }

    await tx
      .delete(schema.issueSignals)
      .where(and(eq(schema.issueSignals.issueId, input.issueId), eq(schema.issueSignals.signalId, input.signalId)));
    for (const o of others) await pin(o.signalId, "unlink");
    await tx.insert(schema.events).values({
      ...tenant,
      entityType: "issue",
      entityId: input.issueId,
      type: "issue.link_rejected",
      actor: input.decidedBy,
      payload: { signal_id: input.signalId, unlinked_from: others.length, note: input.note ?? null },
    });
    return { pinned: others.length, removed: true };
  });
}
