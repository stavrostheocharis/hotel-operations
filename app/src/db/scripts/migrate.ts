import "dotenv/config";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { assertNotDefaultPassword, createDb, type Db } from "../index";
import { migrationsFolder } from "./lib/paths";

export async function runMigrations(db: Db) {
  await migrate(db, { migrationsFolder: migrationsFolder() });
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (copy .env.example to .env)");
  assertNotDefaultPassword(url, "DATABASE_URL");
  const db = createDb(url, { max: 1 });
  try {
    await runMigrations(db);
    console.log("migrations applied");
  } finally {
    await db.$client.end();
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
