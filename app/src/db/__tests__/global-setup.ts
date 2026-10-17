import postgres from "postgres";
import { createDb } from "../index";
import { loadSynthetic } from "../scripts/load-synthetic";
import { runMigrations } from "../scripts/migrate";
import { seed, seedUsers } from "../scripts/seed";
import { createFakeLlm } from "@/normalize/llm";
import { normalizeSignals } from "@/normalize/pipeline";
import { TEST_PASSWORD, TEST_URL } from "./env";

/**
 * Drop and recreate the test database, apply every migration from scratch,
 * seed the demo property and load the synthetic exports. Runs once per
 * `vitest` invocation; the tests then read from the result.
 */
export async function setup() {
  const url = new URL(TEST_URL);
  const dbName = url.pathname.slice(1);
  url.pathname = "/postgres";
  const admin = postgres(url.toString(), { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await admin.unsafe(`CREATE DATABASE "${dbName}"`);
  } finally {
    await admin.end();
  }

  const db = createDb(TEST_URL, { max: 1 });
  try {
    const t0 = Date.now();
    await runMigrations(db);
    await seed(db);
    await seedUsers(db, { password: TEST_PASSWORD });
    await loadSynthetic(db);
    await normalizeSignals(db, { llm: createFakeLlm() });
    console.log(`test database ready in ${Date.now() - t0} ms`);
  } finally {
    await db.$client.end();
  }
}
