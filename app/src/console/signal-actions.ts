"use server";

import { and, eq, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { assertCan, AuthorizationError, type Department } from "@/auth/permissions";
import { requireViewer } from "@/auth/viewer";
import { getAppDb, schema, withTenant } from "@/db";
import { t } from "@/i18n";
import { CATEGORIES, TOPICS } from "@/normalize/taxonomy";
import type { ActionResult } from "./issue-actions";
import { searchIssues, type IssueMatch } from "./signals";

/**
 * What a supervisor does to a record from the inbox: fix its place or its
 * category (locked against the next normalisation run), put it into an
 * issue, or start an issue from it.
 */
const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};
const opt = (fd: FormData, k: string) => str(fd, k).trim() || null;

async function run(fn: () => Promise<string>): Promise<ActionResult> {
  try {
    const message = await fn();
    refresh();
    return { ok: true, message, at: Date.now() };
  } catch (err) {
    if (err instanceof AuthorizationError) return { ok: false, message: t("common.notAllowed"), at: Date.now() };
    return { ok: false, message: err instanceof Error ? err.message : String(err), at: Date.now() };
  }
}

async function loadSignal(tx: Parameters<Parameters<typeof withTenant>[2]>[0], id: string) {
  const [s] = await tx
    .select({ id: schema.signals.id, groupId: schema.signals.groupId, propertyId: schema.signals.propertyId, lockedFields: schema.signals.lockedFields, locationId: schema.signals.locationId, category: schema.signals.category, topic: schema.signals.topic })
    .from(schema.signals)
    .where(eq(schema.signals.id, id));
  if (!s) throw new Error("record not found");
  return s;
}

export async function relocateSignalAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    assertCan(viewer.actor(), "signals.review");
    const signalId = str(fd, "signalId");
    const locationId = opt(fd, "locationId");
    const code = await withTenant(getAppDb(), viewer.tenant, async (tx) => {
      const s = await loadSignal(tx, signalId);
      let code: string | null = null;
      if (locationId) {
        const [l] = await tx.select({ id: schema.locations.id, code: schema.locations.code }).from(schema.locations).where(eq(schema.locations.id, locationId));
        if (!l) throw new Error("place not found");
        code = l.code;
      }
      const locked = Array.from(new Set([...(s.lockedFields ?? []), "location"]));
      await tx
        .update(schema.signals)
        .set({ locationId: locationId, locationMethod: locationId ? "human" : "none", locationConfidence: locationId ? "1.000" : null, lockedFields: locked })
        .where(eq(schema.signals.id, s.id));
      await tx.insert(schema.events).values({ groupId: s.groupId, propertyId: s.propertyId, entityType: "signal", entityId: s.id, type: "signal.reviewed", actor: viewer.user.id, payload: { field: "location", from: s.locationId, to: locationId } });
      return code;
    });
    return code ? t("signals.toast.relocated", { place: code }) : t("signals.toast.unlocated");
  });
}

export async function reclassifySignalAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    assertCan(viewer.actor(), "signals.review");
    const signalId = str(fd, "signalId");
    const category = opt(fd, "category");
    const topic = opt(fd, "topic");
    if (category && !(CATEGORIES as readonly string[]).includes(category)) throw new Error("unknown category");
    if (topic && !(topic in TOPICS)) throw new Error("unknown topic");
    if (topic && category && TOPICS[topic].category !== category) throw new Error("topic does not belong to that category");
    await withTenant(getAppDb(), viewer.tenant, async (tx) => {
      const s = await loadSignal(tx, signalId);
      const locked = Array.from(new Set([...(s.lockedFields ?? []), "category", "topic"]));
      await tx.update(schema.signals).set({ category, topic, lockedFields: locked }).where(eq(schema.signals.id, s.id));
      await tx.insert(schema.events).values({ groupId: s.groupId, propertyId: s.propertyId, entityType: "signal", entityId: s.id, type: "signal.reviewed", actor: viewer.user.id, payload: { field: "classification", from: { category: s.category, topic: s.topic }, to: { category, topic } } });
    });
    return t("signals.toast.reclassified", { what: (topic ?? category ?? t("common.none")).replace(/_/g, " ") });
  });
}

export async function linkSignalToIssueAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    assertCan(viewer.actor(), "links.decide");
    const signalId = str(fd, "signalId");
    const issueId = str(fd, "issueId");
    const title = await withTenant(getAppDb(), viewer.tenant, async (tx) => {
      const s = await loadSignal(tx, signalId);
      const [issue] = await tx.select({ id: schema.issues.id, title: schema.issues.title }).from(schema.issues).where(eq(schema.issues.id, issueId));
      if (!issue) throw new Error("issue not found");
      const tenant = { groupId: s.groupId, propertyId: s.propertyId };
      await tx
        .insert(schema.issueSignals)
        .values({ ...tenant, issueId, signalId, role: "supporting", confidence: "1.000", method: "human", evidence: { rule: "inbox" }, decidedBy: viewer.user.id })
        .onConflictDoNothing();
      // Pin to the issue's first report, so a rebuild keeps them together.
      const [primary] = await tx
        .select({ signalId: schema.issueSignals.signalId })
        .from(schema.issueSignals)
        .where(and(eq(schema.issueSignals.issueId, issueId), eq(schema.issueSignals.role, "primary")));
      if (primary && primary.signalId !== signalId) {
        const [a, b] = primary.signalId < signalId ? [primary.signalId, signalId] : [signalId, primary.signalId];
        await tx
          .insert(schema.linkDecisions)
          .values({ ...tenant, signalA: a, signalB: b, decision: "link", decidedBy: viewer.user.id })
          .onConflictDoUpdate({ target: [schema.linkDecisions.propertyId, schema.linkDecisions.signalA, schema.linkDecisions.signalB], set: { decision: "link", decidedBy: viewer.user.id, createdAt: new Date() } });
      }
      await tx.insert(schema.events).values({ ...tenant, entityType: "issue", entityId: issueId, type: "issue.link_confirmed", actor: viewer.user.id, payload: { signal_id: signalId, via: "inbox" } });
      return issue.title;
    });
    return t("signals.toast.linked", { issue: title });
  });
}

export async function createIssueFromSignalAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const viewer = await requireViewer();
  let issueId: string | null = null;
  const result = await run(async () => {
    assertCan(viewer.actor(), "links.decide");
    const signalId = str(fd, "signalId");
    const title = str(fd, "title").trim();
    if (!title) throw new Error(t("signals.create.titleRequired"));
    const category = opt(fd, "category");
    const severity = opt(fd, "severity") ?? "medium";
    const department = opt(fd, "department") as Department | null;
    const owner = opt(fd, "ownerUserId");
    const ownerUserId = owner === "none" ? null : owner;
    issueId = await withTenant(getAppDb(), viewer.tenant, async (tx) => {
      const s = await loadSignal(tx, signalId);
      const [sig] = await tx.select({ occurredAt: schema.signals.occurredAt }).from(schema.signals).where(eq(schema.signals.id, s.id));
      const tenant = { groupId: s.groupId, propertyId: s.propertyId };
      const now = new Date();
      const [issue] = await tx
        .insert(schema.issues)
        .values({
          ...tenant,
          title,
          category: category ?? s.category,
          severity: severity as (typeof schema.issueSeverity.enumValues)[number],
          status: ownerUserId ? "assigned" : "detected",
          derivedStatus: "detected",
          statusSource: "human",
          statusChangedAt: now,
          statusChangedBy: viewer.user.id,
          locationId: s.locationId,
          department,
          ownerUserId,
          assignedAt: ownerUserId ? now : null,
          assignedBy: ownerUserId ? viewer.user.id : null,
          openedAt: sig.occurredAt,
          rootCause: t("signals.create.rootCause", { name: viewer.user.name }),
        })
        .returning({ id: schema.issues.id });
      await tx.insert(schema.issueSignals).values({ ...tenant, issueId: issue.id, signalId: s.id, role: "primary", confidence: "1.000", method: "human", evidence: { rule: "inbox" }, decidedBy: viewer.user.id });
      await tx.insert(schema.events).values([
        { ...tenant, entityType: "issue", entityId: issue.id, type: "issue.created_manually", actor: viewer.user.id, payload: { signal_id: s.id, title } },
        ...(ownerUserId ? [{ ...tenant, entityType: "issue", entityId: issue.id, type: "issue.assigned", actor: viewer.user.id, payload: { owner_user_id: ownerUserId, owner_name: opt(fd, "ownerName"), department } }] : []),
      ]);
      await tx.execute(sql`select 1`);
      return issue.id;
    });
    return t("signals.toast.created");
  });
  if (result.ok && issueId) redirect(`/issues/${issueId}`);
  return result;
}

/** For the "link to…" search box. */
export async function searchIssuesAction(q: string): Promise<IssueMatch[]> {
  const viewer = await requireViewer();
  return searchIssues(getAppDb(), viewer.scoped, q);
}
