import { renderMarkdown, renderWinterWorksCsv } from "@/audit/markdown";
import { buildAuditReport } from "@/audit/report";
import { getCurrentTenant } from "@/console/tenant";
import { getAppDb } from "@/db";

/**
 * GET /reports/audit/export?format=md|csv|json[&from=YYYY-MM-DD&to=YYYY-MM-DD]
 *
 * The same report the page shows, as a file: the written report (Markdown),
 * the winter-works list (semicolon CSV with a BOM, for Greek-locale Excel)
 * or the full data (JSON). No model narrative here; that is the CLI's job.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "md";
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;
  if (from && !isDate(from)) return new Response("from must be YYYY-MM-DD", { status: 400 });
  if (to && !isDate(to)) return new Response("to must be YYYY-MM-DD", { status: 400 });

  const tenant = await getCurrentTenant();
  const report = await buildAuditReport(getAppDb(), tenant, { from, to });
  const stem = `audit-${report.property.code.toLowerCase()}-${report.season.from}-${report.season.to}`;

  switch (format) {
    case "json":
      return new Response(JSON.stringify(report, null, 2), {
        headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="${stem}.json"` },
      });
    case "csv":
      return new Response(renderWinterWorksCsv(report), {
        headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="winter-works-${stem.slice(6)}.csv"` },
      });
    case "md":
      return new Response(renderMarkdown(report), {
        headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="${stem}.md"` },
      });
    default:
      return new Response("format must be md, csv or json", { status: 400 });
  }
}

function isDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}
