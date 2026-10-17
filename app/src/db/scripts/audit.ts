import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderMarkdown, renderWinterWorksCsv } from "@/audit/markdown";
import { addNarrative, createFakeNarrator, createOpenAiNarrator } from "@/audit/narrative";
import { buildAuditReport } from "@/audit/report";
import { createDb } from "../index";
import { repoRoot } from "./lib/paths";
import { findProperty } from "./seed";

/**
 * pnpm db:audit [--from=YYYY-MM-DD] [--to=YYYY-MM-DD] [--out=DIR] [--property=CODE] [--llm | --fake-llm]
 *
 *   --from / --to   season window, property-local dates (default: the property's season)
 *   --out=DIR       where to write audit.json, audit.md and winter-works.csv (default: data/reports/audit,
 *                   outside data/out so the exports folder stays exactly what the client delivered)
 *   --property      property code (default ASTRAEA)
 *   --llm           add a model-written summary (OpenAI reasoning model)
 *   --fake-llm      add the deterministic summary instead, no network call
 *
 * Reads through the app role when DATABASE_URL_APP is set, so the report is
 * produced under the same row-level security as the console.
 */
async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => args.includes(`--${name}`);
  const opt = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];

  const adminUrl = process.env.DATABASE_URL;
  if (!adminUrl) throw new Error("DATABASE_URL is not set (copy .env.example to .env)");
  const admin = createDb(adminUrl, { max: 1 });
  const appUrl = process.env.DATABASE_URL_APP;
  const app = appUrl ? createDb(appUrl, { max: 2 }) : admin;
  try {
    const property = await findProperty(admin, opt("property") ?? "ASTRAEA");
    if (!property) throw new Error("property not seeded; run db:seed first");
    const ctx = { groupId: property.groupId, propertyIds: [property.id] };

    let report = await buildAuditReport(app, ctx, { from: opt("from"), to: opt("to"), label: opt("label") });
    if (flag("llm") || flag("fake-llm")) {
      const narrator = flag("llm") ? createOpenAiNarrator() : createFakeNarrator();
      console.log(`narrative: ${narrator.model}`);
      report = await addNarrative(report, narrator);
    }

    const out = opt("out") ?? path.join(repoRoot, "data", "reports", "audit");
    await mkdir(out, { recursive: true });
    await writeFile(path.join(out, "audit.json"), JSON.stringify(report, null, 2));
    await writeFile(path.join(out, "audit.md"), renderMarkdown(report));
    await writeFile(path.join(out, "winter-works.csv"), renderWinterWorksCsv(report));

    const b = report.baseline;
    console.log(`${report.property.name}, ${report.season.label} (${report.season.from} → ${report.season.to})`);
    console.log(`${report.volume.signalsTotal} records, ${report.volume.issues} issues, ${report.volume.issuesRecurring} recurring`);
    console.log(`repeats / 1,000 room-nights: ${b.repeatsPerThousandRoomNights ?? "–"} · held 30 d: ${b.held30}/${b.closures} · reopen rate: ${b.reopenRate ?? "–"}`);
    console.log(`winter works: ${report.winterWorks.length} items · written to ${out}`);
  } finally {
    if (app !== admin) await app.$client.end();
    await admin.$client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
