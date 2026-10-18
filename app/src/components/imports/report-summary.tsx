import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { missingForLoad, type ImportMapping } from "@/import/mapping";
import { label, t } from "@/i18n";
import type { Colour, RealityReport } from "@/reality/types";

import { VERDICT_VARIANT } from "./stage";

const COLOUR: Record<Colour, "success" | "warning" | "critical" | "secondary"> = { green: "success", amber: "warning", red: "critical", na: "secondary" };

/**
 * The reality check, read on screen: the verdict and why, what the folder
 * holds, how the columns map, the scorecard and what to ask the client.
 */
export function ReportSummary({ report, mapping }: { report: RealityReport; mapping: ImportMapping | null }) {
  const received = report.datasets.filter((d) => d.status === "received");
  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              {t("imports.batch.reasons")}
              <Badge variant={VERDICT_VARIANT[report.decision.verdict]}>{label("imports.verdict", report.decision.verdict)}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-body text-foreground">
              {report.decision.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
              {report.decision.stopConditions.map((r) => (
                <li key={r} className="text-critical">
                  {r}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("imports.batch.datasets")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dataset</TableHead>
                  <TableHead className="text-right">Rows</TableHead>
                  <TableHead className="hidden md:table-cell">Period</TableHead>
                  <TableHead>{t("imports.batch.mapping")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.datasets.map((d) => {
                  const fm = mapping?.files.filter((f) => f.dataset === d.dataset) ?? [];
                  const missing = fm.flatMap(missingForLoad);
                  const fields = fm.reduce((n, f) => n + Object.keys(f.fields).length, 0);
                  return (
                    <TableRow key={d.dataset}>
                      <TableCell className="whitespace-normal">
                        <span className={d.status === "received" ? "text-body-strong text-foreground" : "text-body text-muted-foreground"}>{d.label}</span>
                        <span className="text-caption text-muted-foreground"> · {d.priority}</span>
                        {d.files.length ? <div className="text-caption text-muted-foreground">{d.files.join(", ")}</div> : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{d.status === "received" ? d.rows.toLocaleString("en-GB") : "–"}</TableCell>
                      <TableCell className="hidden text-caption text-muted-foreground md:table-cell">{d.dateRange ? `${d.dateRange.from} → ${d.dateRange.to}` : "–"}</TableCell>
                      <TableCell className="whitespace-normal text-caption">
                        {d.status !== "received" ? (
                          <Badge variant="secondary">missing</Badge>
                        ) : missing.length ? (
                          <span className="text-critical">{t("imports.batch.missing", { fields: missing.join(", ") })}</span>
                        ) : (
                          <span className="text-muted-foreground">{t("imports.batch.mappedFields", { n: fields })}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        {received.length === 0 ? null : (
          <Card>
            <CardHeader>
              <CardTitle>Scorecard</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableBody>
                  {report.scorecard.map((d) => (
                    <TableRow key={d.dimension}>
                      <TableCell className="w-12 text-caption text-muted-foreground">{d.dimension}</TableCell>
                      <TableCell className="whitespace-normal">
                        <div className="text-body text-foreground">{d.title}</div>
                        <div className="text-caption text-muted-foreground">{d.rows.map((r) => `${r.measure}: ${r.value}`).join(" · ")}</div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={COLOUR[d.colour]}>{d.colour}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("imports.batch.asks")}</CardTitle>
          </CardHeader>
          <CardContent>
            {report.asks.length === 0 ? (
              <p className="text-body text-muted-foreground">–</p>
            ) : (
              <ul className="flex list-disc flex-col gap-2 pl-5 text-body text-foreground">
                {report.asks.map((a) => (
                  <li key={a.text}>{a.text}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        {report.unread.length ? (
          <Card>
            <CardHeader>
              <CardTitle>Not read</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-1 text-caption text-muted-foreground">
                {report.unread.map((u) => (
                  <li key={u.path}>
                    {u.path} · {u.reason}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
