import "dotenv/config";
import { createDb } from "../index";
import { embedSignals } from "@/link/embeddings";
import { evaluateLinking, formatLinkReport } from "@/link/eval";
import { linkSignals } from "@/link/pipeline";
import { createFakeLlm, createOpenAiLlm } from "@/normalize/llm";
import { dataDir } from "./lib/paths";
import { findProperty } from "./seed";

/**
 * pnpm db:link [--embed] [--llm] [--fake-llm] [--judge-limit=N] [--eval]
 *
 *   --embed          compute missing signal embeddings first (OpenAI) and use them on gray pairs
 *   --llm            let the reasoning model judge the pairs still in the gray zone
 *   --judge-limit=N  send at most N gray pairs to the model, best rule score first
 *   --fake-llm       exercise the judge code path without a network call
 *   --eval           score against data/out/answer_key.json afterwards
 *
 * Issues are rebuilt from scratch for the property on every run.
 */
async function main() {
  const args = new Set(process.argv.slice(2));
  const limitArg = [...args].find((a) => a.startsWith("--judge-limit="));
  const judgeLimit = limitArg ? Number(limitArg.split("=")[1]) : undefined;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (copy .env.example to .env)");
  const db = createDb(url, { max: 2 });
  try {
    const property = await findProperty(db);
    if (!property) throw new Error("property not seeded");
    if (args.has("--embed")) {
      const r = await embedSignals(db, { propertyId: property.id, log: console.log });
      console.log(`embeddings: ${r.embedded} new rows with ${r.model}`);
    }
    const llm = args.has("--llm") ? createOpenAiLlm() : args.has("--fake-llm") ? createFakeLlm() : null;
    if (llm) console.log(`pair judge: ${llm.reasoningModel}`);
    const res = await linkSignals(db, { llm, useEmbeddings: args.has("--embed"), judgeLimit, log: console.log });
    console.log(JSON.stringify(res, null, 2));
    if (args.has("--eval")) {
      const report = await evaluateLinking(db, property.id, dataDir());
      console.log("\n" + formatLinkReport(report));
    }
  } finally {
    await db.$client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
