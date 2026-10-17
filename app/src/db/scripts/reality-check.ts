import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { runRealityCheck } from "@/reality";
import { dataDir } from "./lib/paths";

/**
 * pnpm db:reality-check --dir=<folder> [--out=DIR] [--quiet]
 *
 *   --dir=FOLDER   the client's export folder as delivered (CSV / XLSX / JSON; default: data/out)
 *   --out=DIR      where to write reality-check.md and reality-check.json (default: <dir>/reality-check)
 *   --quiet        no summary on stdout
 *
 * Reads the folder in memory and writes the go / reshape / stop memo. Needs
 * no database and no network: nothing from the export is loaded or sent.
 */
async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => args.includes(`--${name}`);
  const opt = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

  const dir = path.resolve(process.cwd(), opt("dir") ?? dataDir());
  const out = path.resolve(process.cwd(), opt("out") ?? path.join(dir, "reality-check"));
  const t0 = Date.now();
  const { report, memo } = await runRealityCheck(dir, { skipDirs: [out] });

  await mkdir(out, { recursive: true });
  await writeFile(path.join(out, "reality-check.md"), memo);
  await writeFile(path.join(out, "reality-check.json"), JSON.stringify(report, null, 2));

  if (!flag("quiet")) {
    const received = report.datasets.filter((d) => d.status === "received").length;
    console.log(`${dir}`);
    console.log(`${report.files.length} table(s) read, ${report.unread.length} file(s) not parsed, ${received} of ${report.datasets.length} datasets recognised`);
    for (const f of report.files) console.log(`  ${f.path}: ${f.datasetLabel}, ${f.rows} rows${f.dateRange ? `, ${f.dateRange.from} → ${f.dateRange.to}` : ""}`);
    for (const u of report.unread) console.log(`  ${u.path}: not parsed (${u.reason})`);
    console.log(report.scorecard.map((d) => `${d.dimension} ${d.colour}`).join(" · "));
    console.log(`verdict: ${report.decision.verdict.toUpperCase()} · ${report.asks.length} ask(s) · ${report.gaps.length} gap(s) · ${Date.now() - t0} ms`);
    console.log(`written to ${out}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
