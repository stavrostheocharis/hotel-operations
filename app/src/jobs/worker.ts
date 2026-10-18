import "dotenv/config";
import { createDb } from "@/db";
import { runJob } from "./run";

/**
 * The detached worker: `tsx src/jobs/worker.ts --job <id>`. Spawned by the
 * web app (src/jobs/runner.ts); runs one job on the migrator connection
 * (batch work is what that role is for) and exits.
 */
async function main() {
  const arg = process.argv.find((a) => a.startsWith("--job="))?.split("=")[1] ?? process.argv[process.argv.indexOf("--job") + 1];
  if (!arg) throw new Error("usage: worker --job <id>");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const db = createDb(url, { max: 2 });
  try {
    const res = await runJob(db, arg, { log: (l) => console.log(l) });
    console.log(`job ${arg}: ${res.status}`);
    if (res.status === "failed") process.exitCode = 1;
  } finally {
    await db.$client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
