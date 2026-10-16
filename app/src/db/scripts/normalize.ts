import "dotenv/config";
import { createDb } from "../index";
import { evaluateNormalization, formatReport } from "@/normalize/eval";
import { createFakeLlm, createOpenAiLlm } from "@/normalize/llm";
import { normalizeSignals } from "@/normalize/pipeline";
import { dataDir } from "./lib/paths";
import { findProperty } from "./seed";

/**
 * pnpm db:normalize [--llm] [--fake-llm] [--all] [--limit=N] [--eval]
 *
 *   --llm       use OpenAI (OPENAI_API_KEY, OPENAI_MODEL_FAST) for translation,
 *               leftover locations and unclear classifications
 *   --fake-llm  exercise the LLM code path without a network call
 *   --all       re-process rows that were normalised before
 *   --limit=N   stop after N signals
 *   --eval      score against data/out/answer_key.json afterwards
 */
async function main() {
  const args = new Set(process.argv.slice(2));
  const limitArg = [...args].find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : undefined;

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (copy .env.example to .env)");
  const db = createDb(url, { max: 2 });
  try {
    const llm = args.has("--llm") ? createOpenAiLlm() : args.has("--fake-llm") ? createFakeLlm() : null;
    if (llm) console.log(`LLM stage: ${llm.model} (${llm.promptVersion})`);
    const res = await normalizeSignals(db, { llm, all: args.has("--all"), limit, log: console.log });
    console.log(JSON.stringify(res, null, 2));
    if (args.has("--eval")) {
      const property = await findProperty(db);
      if (!property) throw new Error("property not seeded");
      const report = await evaluateNormalization(db, property.id, dataDir());
      console.log("\n" + formatReport(report));
    }
  } finally {
    await db.$client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
