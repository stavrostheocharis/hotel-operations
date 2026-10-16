import "dotenv/config";
import { createDb } from "../index";
import { embedSignals } from "@/link/embeddings";
import { findProperty } from "./seed";

/** pnpm db:embed — compute missing signal embeddings with OpenAI. */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (copy .env.example to .env)");
  const db = createDb(url, { max: 2 });
  try {
    const property = await findProperty(db);
    if (!property) throw new Error("property not seeded");
    const r = await embedSignals(db, { propertyId: property.id, log: console.log });
    console.log(`done: ${r.embedded} new embeddings (${r.model})`);
  } finally {
    await db.$client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
