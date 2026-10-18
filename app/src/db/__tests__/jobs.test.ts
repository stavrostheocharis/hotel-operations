import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, schema, type Db, type TenantContext } from "../index";
import { dataDir } from "../scripts/lib/paths";
import { findProperty } from "../scripts/seed";
import { createFakeLlm } from "@/normalize/llm";
import { getJob, latestJobs, listJobs } from "@/jobs/queries";
import { claimNextJob, markStalled, runClaimed, runJob, sweepStalled } from "@/jobs/run";
import { TEST_APP_URL, TEST_URL } from "./env";
import { expectDbError } from "./helpers";

let admin: Db;
let app: Db;
let ctx: TenantContext;
let tenant: { groupId: string; propertyId: string };
let gmId: string;

beforeAll(async () => {
  admin = createDb(TEST_URL, { max: 2 });
  app = createDb(TEST_APP_URL, { max: 2 });
  const p = await findProperty(admin);
  if (!p) throw new Error("seed missing");
  ctx = { groupId: p.groupId, propertyIds: [p.id] };
  tenant = { groupId: p.groupId, propertyId: p.id };
  const [gm] = await admin.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, "gm@demo.hotel"));
  gmId = gm.id;
});

afterAll(async () => {
  await admin.delete(schema.jobs).where(eq(schema.jobs.propertyId, tenant.propertyId));
  await app.$client.end();
  await admin.$client.end();
});

const insertJob = (values: Partial<typeof schema.jobs.$inferInsert> & { kind: (typeof schema.jobKind.enumValues)[number] }) =>
  admin
    .insert(schema.jobs)
    .values({ ...tenant, requestedBy: gmId, params: { propertyCode: "ASTRAEA" }, ...values })
    .returning({ id: schema.jobs.id })
    .then((r) => r[0].id);

describe("background jobs", () => {
  it("runs a link job in-process: claims the row, reports progress, stores the result and the events", async () => {
    const id = await insertJob({ kind: "link" });
    const out = await runJob(admin, id, { llm: createFakeLlm(), heartbeatMs: 50 });
    expect(out.status).toBe("succeeded");
    const job = (await getJob(app, ctx, id))!;
    expect(job.status).toBe("succeeded");
    expect(job.progress).toEqual({ step: "link", done: 1, total: 1, message: undefined });
    expect(Number(job.result.issues)).toBeGreaterThan(0);
    expect(job.startedAt).not.toBeNull();
    expect(job.finishedAt).not.toBeNull();
    expect(job.stalled).toBe(false);
    const events = await admin
      .select({ type: schema.events.type })
      .from(schema.events)
      .where(and(eq(schema.events.entityType, "job"), eq(schema.events.entityId, id)));
    expect(events.map((e) => e.type).sort()).toEqual(["job.finished", "job.started"]);
    // the job is not queued any more: a second run is refused
    await expect(runJob(admin, id, { llm: createFakeLlm() })).rejects.toThrow(/not queued/);
  });

  it("works from the job's property id alone, without a code in the params", async () => {
    const id = await insertJob({ kind: "normalize", params: {} });
    const out = await runJob(admin, id, { llm: createFakeLlm(), heartbeatMs: 50 });
    expect(out.status).toBe("succeeded");
  });

  it("checks an export in the worker: the batch goes checking → checked with its verdict and mapping", async () => {
    const [batch] = await admin
      .insert(schema.importBatches)
      .values({ ...tenant, source: "folder", dir: dataDir(), files: [], status: "checking", createdBy: gmId })
      .returning({ id: schema.importBatches.id });
    const id = await insertJob({ kind: "check", params: { batchId: batch.id } });
    const out = await runJob(admin, id, { heartbeatMs: 50 });
    expect(out.status).toBe("succeeded");
    expect(out.result?.verdict).toBe("go");
    const [b] = await admin.select().from(schema.importBatches).where(eq(schema.importBatches.id, batch.id));
    expect(b.status).toBe("checked");
    expect(b.verdict).toBe("go");
    expect((b.mapping as { files: unknown[] }).files.length).toBeGreaterThan(5);
    const events = await admin.execute<{ n: number }>(sql`select count(*)::int as n from events where entity_id = ${batch.id} and type = 'import.checked'`);
    expect(Number(events[0].n)).toBe(1);
    await admin.delete(schema.importBatches).where(eq(schema.importBatches.id, batch.id));
  });

  it("allows one queued or running job per kind and property", async () => {
    const first = await insertJob({ kind: "normalize" });
    await expectDbError(insertJob({ kind: "normalize" }), /jobs_one_active_per_kind/);
    // a different kind is fine, and so is the same kind once the first is over
    const other = await insertJob({ kind: "embed" });
    await admin.update(schema.jobs).set({ status: "cancelled", finishedAt: new Date() }).where(eq(schema.jobs.id, first));
    const second = await insertJob({ kind: "normalize" });
    expect(second).not.toBe(first);
    await admin.update(schema.jobs).set({ status: "cancelled" }).where(sql`${schema.jobs.id} in (${other}, ${second})`);
  });

  it("ends failed with the error when the work throws, and the batch of a failed import follows", async () => {
    const [batch] = await admin
      .insert(schema.importBatches)
      .values({ ...tenant, source: "folder", dir: "/nowhere", files: [], status: "checked", verdict: "go", mapping: { version: "import-mapping-v1", files: [] }, createdBy: gmId })
      .returning({ id: schema.importBatches.id });
    const id = await insertJob({ kind: "import", params: { propertyCode: "ASTRAEA", batchId: batch.id } });
    const out = await runJob(admin, id, { llm: createFakeLlm(), heartbeatMs: 50 });
    expect(out.status).toBe("failed");
    expect(out.error).toMatch(/nowhere|ENOENT|no such/i);
    const job = (await getJob(app, ctx, id))!;
    expect(job.status).toBe("failed");
    expect(job.error).toBe(out.error);
    expect(job.log.at(-1)?.line).toMatch(/^failed:/);
    const [b] = await admin.select().from(schema.importBatches).where(eq(schema.importBatches.id, batch.id));
    expect(b.status).toBe("failed");
    expect(b.error).toBe(out.error);
    await admin.delete(schema.importBatches).where(eq(schema.importBatches.id, batch.id));
  });

  it("marks a running job whose heartbeat stopped as failed, and leaves a live one alone", async () => {
    const stale = await insertJob({ kind: "audit", status: "running", startedAt: new Date(), heartbeatAt: new Date(Date.now() - 3 * 60_000) });
    expect((await getJob(app, ctx, stale))!.stalled).toBe(true);
    expect(await markStalled(admin, stale)).toBe(true);
    expect((await getJob(app, ctx, stale))!.status).toBe("failed");
    const live = await insertJob({ kind: "audit", status: "running", startedAt: new Date(), heartbeatAt: new Date() });
    expect((await getJob(app, ctx, live))!.stalled).toBe(false);
    expect(await markStalled(admin, live)).toBe(false);
    await admin.update(schema.jobs).set({ status: "cancelled" }).where(eq(schema.jobs.id, live));
  });

  it("hands queued jobs to whichever worker asks first, oldest first, and nothing twice", async () => {
    const first = await insertJob({ kind: "embed" });
    await new Promise((r) => setTimeout(r, 5));
    const second = await insertJob({ kind: "normalize" });
    const a = await claimNextJob(admin);
    const b = await claimNextJob(admin);
    const c = await claimNextJob(admin);
    expect(a?.id).toBe(first);
    expect(a?.status).toBe("running");
    expect(b?.id).toBe(second);
    expect(c).toBeNull();
    await admin.update(schema.jobs).set({ status: "cancelled" }).where(sql`${schema.jobs.id} in (${first}, ${second})`);
  });

  it("a job a person marked failed stops at its next heartbeat and never overwrites their decision", async () => {
    const id = await insertJob({ kind: "link" });
    const job = (await claimNextJob(admin))!;
    expect(job.id).toBe(id);
    const run = runClaimed(admin, job, { llm: createFakeLlm(), heartbeatMs: 20 });
    await new Promise((r) => setTimeout(r, 300));
    await admin.update(schema.jobs).set({ status: "failed", error: "stopped by a person", finishedAt: new Date() }).where(eq(schema.jobs.id, id));
    const out = await run;
    expect(out.status).toBe("failed");
    expect(out.error).toMatch(/stopped elsewhere/);
    const after = (await getJob(app, ctx, id))!;
    expect(after.status).toBe("failed");
    expect(after.error).toBe("stopped by a person");
    const finished = await admin.execute<{ n: number }>(sql`select count(*)::int as n from events where entity_id = ${id} and type = 'job.finished'`);
    expect(Number(finished[0].n)).toBe(0);
  });

  it("the sweeper fails a job whose process died and the batch it left loading, and leaves live jobs alone", async () => {
    const [batch] = await admin
      .insert(schema.importBatches)
      .values({ ...tenant, source: "folder", dir: "/nowhere", files: [], status: "loading", verdict: "go", mapping: { version: "import-mapping-v1", files: [] }, createdBy: gmId })
      .returning({ id: schema.importBatches.id });
    const dead = await insertJob({ kind: "import", status: "running", startedAt: new Date(), heartbeatAt: new Date(Date.now() - 20 * 60_000), params: { propertyCode: "ASTRAEA", batchId: batch.id } });
    await admin.update(schema.importBatches).set({ jobId: dead }).where(eq(schema.importBatches.id, batch.id));
    const live = await insertJob({ kind: "normalize", status: "running", startedAt: new Date(), heartbeatAt: new Date() });
    const swept = await sweepStalled(admin);
    expect(swept.jobs).toBe(1);
    expect((await getJob(app, ctx, dead))!.status).toBe("failed");
    expect((await getJob(app, ctx, live))!.status).toBe("running");
    const [b] = await admin.select().from(schema.importBatches).where(eq(schema.importBatches.id, batch.id));
    expect(b.status).toBe("failed");
    expect(b.error).toMatch(/stopped reporting/);
    // a batch left `loading` by a job that already ended is failed too
    await admin.update(schema.importBatches).set({ status: "loading" }).where(eq(schema.importBatches.id, batch.id));
    expect((await sweepStalled(admin)).batches).toBe(1);
    await admin.update(schema.jobs).set({ status: "cancelled" }).where(eq(schema.jobs.id, live));
    await admin.delete(schema.importBatches).where(eq(schema.importBatches.id, batch.id));
  });

  it("lists through the app role under the tenant and gives the latest of each kind", async () => {
    const all = await listJobs(app, ctx, 50);
    expect(all.length).toBeGreaterThanOrEqual(5);
    expect(all.every((j) => j.requestedByName)).toBe(true);
    const latest = await latestJobs(app, ctx);
    expect(latest.link?.status).toBe("failed"); // the one a person stopped, above
    expect(latest.link?.error).toBe("stopped by a person");
    expect(latest.import?.status).toBe("failed");
    // another property of the group sees none of them
    const empty = await listJobs(app, { groupId: ctx.groupId, propertyIds: [] }, 50).catch(() => []);
    expect(empty).toEqual([]);
  });
});
