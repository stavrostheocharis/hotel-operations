import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, schema, type Db, type TenantContext } from "../index";
import { findProperty } from "../scripts/seed";
import { AuthorizationError, type Actor } from "@/auth/permissions";
import { listAssignableUsers } from "@/console/issue-detail";
import { addIssueNote, assignIssue, changeIssueStatus, recordOutcome, resolveIssue } from "@/console/issue-workflow";
import { getIssue, listIssues } from "@/console/queries";
import { linkSignals } from "@/link/pipeline";
import { createFakeLlm } from "@/normalize/llm";
import { TEST_APP_URL, TEST_URL } from "./env";

let admin: Db;
let app: Db;
let ctx: TenantContext;
let propertyId: string;
let groupId: string;
let gm: Actor;
let staff: Actor;
let gmUserId: string;

const relink = () => linkSignals(admin, { llm: createFakeLlm() });

beforeAll(async () => {
  admin = createDb(TEST_URL, { max: 2 });
  app = createDb(TEST_APP_URL, { max: 2 });
  const p = await findProperty(admin);
  if (!p) throw new Error("seed missing");
  ctx = { groupId: p.groupId, propertyIds: [p.id] };
  propertyId = p.id;
  groupId = p.groupId;
  await admin.delete(schema.linkDecisions).where(eq(schema.linkDecisions.propertyId, p.id));
  await relink();
  const users = await listAssignableUsers(app, ctx, p.id);
  const gmUser = users.find((u) => u.role === "gm")!;
  const staffUser = users.find((u) => u.role === "staff")!;
  gmUserId = gmUser.id;
  gm = { userId: gmUser.id, role: "gm", department: "management" };
  staff = { userId: staffUser.id, role: "staff", department: "engineering" };
});

afterAll(async () => {
  await app.$client.end();
  await admin.$client.end();
});

async function pickReopened(minSignals: number) {
  const { rows } = await listIssues(app, ctx, "reopened", 20);
  return rows.find((r) => r.signals >= minSignals && r.status === "reopened")!;
}

describe("issue workflow", () => {
  it("assigns, keeps the owner and the note through a rebuild, on the same id", async () => {
    const target = await pickReopened(4);
    const res = await assignIssue(app, ctx, gm, { issueId: target.id, ownerUserId: gmUserId, ownerName: "GM", department: "engineering", note: "Boiler first, rooms after." });
    expect(res.status).toBe("assigned");
    let issue = (await getIssue(app, ctx, target.id))!;
    expect(issue.ownerUserId).toBe(gmUserId);
    expect(issue.status).toBe("assigned");
    expect(issue.statusSource).toBe("human");

    const again = await relink();
    expect(again.reconcile.created).toBe(0);
    issue = (await getIssue(app, ctx, target.id))!;
    expect(issue).not.toBeNull();
    expect(issue.ownerUserId).toBe(gmUserId);
    expect(issue.department).toBe("engineering");
    expect(issue.status).toBe("assigned");
    expect(issue.derivedStatus).toBe("reopened");
    expect(issue.signals.length).toBe(target.signals);
    const notes = await admin
      .select({ payload: schema.events.payload })
      .from(schema.events)
      .where(and(eq(schema.events.entityId, target.id), eq(schema.events.type, "issue.note")));
    expect(notes.map((n) => n.payload.text)).toContain("Boiler first, rooms after.");
  });

  it("reopens a human-resolved issue when evidence arrives after the decision, and keeps it otherwise", async () => {
    const target = (await listIssues(app, ctx, "reopened", 40)).rows.filter((r) => r.status === "reopened" && r.signals >= 3)[1]!;
    await resolveIssue(app, ctx, gm, { issueId: target.id, note: "Replaced the pump.", ticketRef: "M-1" });
    let issue = (await getIssue(app, ctx, target.id))!;
    expect(issue.status).toBe("resolved");
    expect(issue.actions.some((a) => a.externalRef === "M-1")).toBe(true);

    // Decided today: the season's evidence is older, so the decision stands.
    await relink();
    issue = (await getIssue(app, ctx, target.id))!;
    expect(issue.status).toBe("resolved");
    expect(issue.statusSource).toBe("human");
    expect(issue.actions.some((a) => a.externalRef === "M-1")).toBe(true);

    // Decided before the last reopening report: the evidence wins.
    await admin.update(schema.issues).set({ statusChangedAt: new Date("2026-01-01T00:00:00Z") }).where(eq(schema.issues.id, target.id));
    const res = await relink();
    expect(res.reconcile.reopenedByEvidence).toBeGreaterThanOrEqual(1);
    issue = (await getIssue(app, ctx, target.id))!;
    expect(issue.status).toBe("reopened");
    expect(issue.statusSource).toBe("system");
    const changes = await admin
      .select({ payload: schema.events.payload })
      .from(schema.events)
      .where(and(eq(schema.events.entityId, target.id), eq(schema.events.type, "issue.status_changed")));
    expect(changes.some((c) => c.payload.to === "reopened" && c.payload.source === "system")).toBe(true);
  });

  it("records a verification: held → verified, came back → reopened", async () => {
    const [a, b] = (await listIssues(app, ctx, "unverified", 10)).rows;
    const held = await recordOutcome(app, ctx, gm, { issueId: a.id, result: "staff_evidence", note: "Checked the room, fine." });
    expect(held.status).toBe("verified");
    const ia = (await getIssue(app, ctx, a.id))!;
    expect(ia.verifiedAt).not.toBeNull();
    expect(ia.outcomes.some((o) => o.kind === "staff_evidence" && o.strength === 2)).toBe(true);

    const back = await recordOutcome(app, ctx, gm, { issueId: b.id, result: "recurred", note: "Guest called again." });
    expect(back.status).toBe("reopened");
    const ib = (await getIssue(app, ctx, b.id))!;
    expect(ib.reopenCount).toBe(b.reopenCount + 1);

    // The human outcome survives a rebuild; the derived ones are rewritten.
    await relink();
    const after = (await getIssue(app, ctx, a.id))!;
    expect(after.outcomes.some((o) => o.kind === "staff_evidence")).toBe(true);
    expect(after.status).toBe("verified");
  });

  it("supersedes a touched issue nothing matched and deletes an untouched one", async () => {
    const tenant = { groupId, propertyId };
    const [touched] = await admin
      .insert(schema.issues)
      .values({ ...tenant, title: "manual · touched", status: "detected", derivedStatus: "detected", openedAt: new Date() })
      .returning({ id: schema.issues.id });
    await addIssueNote(app, ctx, gm, { issueId: touched.id, text: "Keep an eye on this." });
    const [untouched] = await admin
      .insert(schema.issues)
      .values({ ...tenant, title: "manual · untouched", status: "detected", derivedStatus: "detected", openedAt: new Date() })
      .returning({ id: schema.issues.id });

    const res = await relink();
    expect(res.reconcile.superseded).toBeGreaterThanOrEqual(1);
    expect(res.reconcile.deleted).toBeGreaterThanOrEqual(1);
    const [t] = await admin.select({ supersededAt: schema.issues.supersededAt }).from(schema.issues).where(eq(schema.issues.id, touched.id));
    expect(t?.supersededAt).not.toBeNull();
    const [u] = await admin.select({ id: schema.issues.id }).from(schema.issues).where(eq(schema.issues.id, untouched.id));
    expect(u).toBeUndefined();
    const { rows } = await listIssues(app, ctx, "all", 500);
    expect(rows.some((r) => r.id === touched.id)).toBe(false);
  });

  it("enforces who may do what", async () => {
    const target = await pickReopened(2);
    await expect(assignIssue(app, ctx, staff, { issueId: target.id, ownerUserId: null, department: null })).rejects.toBeInstanceOf(AuthorizationError);
    await expect(changeIssueStatus(app, ctx, staff, { issueId: target.id, status: "verified" })).rejects.toBeInstanceOf(AuthorizationError);
    const supervisor: Actor = { userId: staff.userId, role: "supervisor", department: "engineering" };
    await expect(changeIssueStatus(app, ctx, supervisor, { issueId: target.id, status: "closed_unverified" })).rejects.toBeInstanceOf(AuthorizationError);
    await expect(resolveIssue(app, ctx, gm, { issueId: target.id, note: "   " })).rejects.toThrow(/note/);
    const [{ n }] = await admin.execute<{ n: number }>(sql`select count(*)::int as n from events where type = 'issue.note' and entity_id = ${target.id}`);
    await addIssueNote(app, ctx, staff, { issueId: target.id, text: "Staff can leave a note." });
    const [{ m }] = await admin.execute<{ m: number }>(sql`select count(*)::int as m from events where type = 'issue.note' and entity_id = ${target.id}`);
    expect(m).toBe(n + 1);
  });
});
