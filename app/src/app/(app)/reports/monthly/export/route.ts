import { requireViewer } from "@/auth/viewer";
import { buildMonthlyReport, renderMonthlyCsv } from "@/console/reports";
import { getAppDb } from "@/db";
import { canSee } from "@/auth/screens";

/** GET /reports/monthly/export?format=csv|json[&from=YYYY-MM-DD&to=YYYY-MM-DD] */
export async function GET(request: Request) {
  const viewer = await requireViewer();
  if (!canSee(viewer.roleAt(), "reports")) return new Response("forbidden", { status: 403 });
  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "csv";
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;
  const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (from && !isDate(from)) return new Response("from must be YYYY-MM-DD", { status: 400 });
  if (to && !isDate(to)) return new Response("to must be YYYY-MM-DD", { status: 400 });
  const report = await buildMonthlyReport(getAppDb(), viewer.scoped, { from, to });
  const stem = `monthly-${report.property.code.toLowerCase()}-${report.season.from}-${report.season.to}`;
  if (format === "json") {
    return new Response(JSON.stringify(report, null, 2), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="${stem}.json"`, "cache-control": "no-store" } });
  }
  return new Response(renderMonthlyCsv(report), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${stem}.csv"`, "cache-control": "no-store" } });
}
