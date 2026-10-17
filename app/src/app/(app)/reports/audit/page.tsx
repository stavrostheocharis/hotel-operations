import Link from "next/link";
import { Suspense } from "react";

import { fmtHours, fmtInt, fmtNum, fmtPct, guest, label, LANGUAGE, pctCell, period, share, SOURCE, where } from "@/audit/markdown";
import { buildAuditReport } from "@/audit/report";
import type { AuditReport, Verdict } from "@/audit/types";
import { PrintButton } from "@/components/console/print-button";
import { t } from "@/i18n";
import { PageHeader } from "@/components/console/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCurrentTenant } from "@/console/tenant";
import { getAppDb } from "@/db";

export const metadata = { title: "Season audit" };

/**
 * The season audit as a page: the seven deliverables of the offer, computed
 * from the linked data for the demo property. Print it for the PDF; the
 * toolbar links give the Markdown, the winter-works spreadsheet and the raw
 * JSON. `?from=&to=` narrows the season window.
 */
export default function AuditPage(props: PageProps<"/reports/audit">) {
  return (
    <Suspense fallback={<AuditSkeleton />}>
      <AuditContent searchParams={props.searchParams} />
    </Suspense>
  );
}

async function AuditContent({ searchParams }: Pick<PageProps<"/reports/audit">, "searchParams">) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const from = valid(one(params.from));
  const to = valid(one(params.to));
  const tenant = await getCurrentTenant();
  const r = await buildAuditReport(getAppDb(), tenant, { from, to });
  const tz = r.property.timezone;
  const exportHref = (format: string) => `/reports/audit/export?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}), format })}`;

  return (
    <article className="flex flex-col gap-10">
      <PageHeader
        crumbs={[{ label: t("reports.title"), href: "/reports" }, { label: t("reports.audit") }]}
        title={`${r.property.name} · ${r.season.label}`}
        description={`${r.season.from} to ${r.season.to} · ${fmtInt(r.volume.signalsTotal)} records · ${fmtInt(r.volume.issues)} issues, ${fmtInt(r.volume.issuesRecurring)} recurring · no person is named in this report`}
        actions={
          <>
            <PrintButton />
            {/* Plain anchors: these are file downloads, not routes to prefetch. */}
            <a href={exportHref("md")} download className={buttonVariants({ variant: "ghost" })}>
              Markdown
            </a>
            <a href={exportHref("csv")} download className={buttonVariants({ variant: "ghost" })}>
              Winter works (CSV)
            </a>
            <a href={exportHref("json")} download className={buttonVariants({ variant: "ghost" })}>
              JSON
            </a>
          </>
        }
      />

      <Section title="Baseline" lead="The numbers the next season is measured against.">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Figure label="Repeats / 1,000 room-nights" value={fmtNum(r.baseline.repeatsPerThousandRoomNights, 2)} hint={`${fmtInt(r.baseline.repeats)} repeats, ${fmtInt(r.baseline.roomNights)} occupied room-nights`} />
          <Figure label="Closures that held 30 days" value={fmtPct(r.baseline.held30Share)} hint={`${fmtInt(r.baseline.held30)} of ${fmtInt(r.baseline.closures)} closed tickets`} />
          <Figure label="Issues reopened" value={fmtPct(r.baseline.reopenRate)} hint={`${fmtInt(r.baseline.issuesReopened)} of ${fmtInt(r.baseline.issuesWithClosure)} with a closure`} />
          <Figure label="Median ticket to closure" value={fmtHours(r.baseline.medianHoursToResolve)} hint={`${fmtInt(r.timeToResolve.firstHalf.tickets + r.timeToResolve.secondHalf.tickets)} closed tickets`} />
        </div>
      </Section>

      <Section
        title="1. Recurring failures by room, building and equipment"
        lead={`${fmtInt(r.volume.issuesRecurring)} issues came back at the same place: two or more episodes a week apart, or a reopen after a closure. Shared-plant problems are shown once, at the cause, with the rooms they reached.`}
      >
        <div className="grid gap-6 lg:grid-cols-[1fr_3fr]">
          <DataTable
            head={["Kind of place", "Issues", "Recurring"]}
            rows={r.volume.byLocationKind.map((k) => [k.kind, fmtInt(k.issues), fmtInt(k.recurring)])}
            numeric={[1, 2]}
          />
          <DataTable
            head={["Issue", "Where", "Episodes", "Reopens", "Closures", "Rooms", "Guest reports", "First → last"]}
            rows={r.recurring.map((f) => [<IssueLink key={f.issueId} id={f.issueId} title={f.title} />, where(f), fmtInt(f.episodes), fmtInt(f.reopens), fmtInt(f.closures), fmtInt(f.roomsAffected), guest(f), period(f, tz)])}
            numeric={[2, 3, 4, 5]}
          />
        </div>
      </Section>

      <Section
        title="2. Fixes that did not hold"
        lead={`Of ${fmtInt(r.fixesHeld.total.closures)} tickets closed in the season, the same problem was reported again at the same place within 7 days for ${fmtInt(r.fixesHeld.total.back7)} (${fmtPct(share(r.fixesHeld.total.back7, r.fixesHeld.total.closures))}), within 30 days for ${fmtInt(r.fixesHeld.total.back30)} (${fmtPct(share(r.fixesHeld.total.back30, r.fixesHeld.total.closures))}) and within 90 days for ${fmtInt(r.fixesHeld.total.back90)} (${fmtPct(share(r.fixesHeld.total.back90, r.fixesHeld.total.closures))}). By category and by month; not by technician.`}
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <DataTable
            head={["Category", "Closures", "Back in 7 d", "Back in 30 d", "Back in 90 d"]}
            rows={r.fixesHeld.byCategory.map((c) => [label(c.category), fmtInt(c.closures), pctCell(c.back7, c.closures), pctCell(c.back30, c.closures), pctCell(c.back90, c.closures)])}
            numeric={[1, 2, 3, 4]}
          />
          <DataTable
            head={["Month", "Closures", "Back in 7 d", "Back in 30 d", "Back in 90 d"]}
            rows={r.fixesHeld.byMonth.map((m) => [m.month, fmtInt(m.closures), pctCell(m.back7, m.closures), pctCell(m.back30, m.closures), pctCell(m.back90, m.closures)])}
            numeric={[1, 2, 3, 4]}
          />
        </div>
      </Section>

      <Section
        title="3. Time to resolve"
        lead={`Median ${fmtHours(r.timeToResolve.firstHalf.medianHours)} in the first half of the season (${fmtInt(r.timeToResolve.firstHalf.tickets)} tickets) against ${fmtHours(r.timeToResolve.secondHalf.medianHours)} in the second half (${fmtInt(r.timeToResolve.secondHalf.tickets)} tickets).`}
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <DataTable
            head={["Category", "Closed tickets", "Median", "90th percentile"]}
            rows={r.timeToResolve.byCategory.map((c) => [label(c.category), fmtInt(c.tickets), fmtHours(c.medianHours), fmtHours(c.p90Hours)])}
            numeric={[1, 2, 3]}
          />
          <DataTable
            head={["Month", "Closed tickets", "Median", "90th percentile"]}
            rows={r.timeToResolve.byMonth.map((m) => [m.month, fmtInt(m.tickets), fmtHours(m.medianHours), fmtHours(m.p90Hours)])}
            numeric={[1, 2, 3]}
          />
        </div>
      </Section>

      <Section title="4. Reviews and surveys tied to operational causes">
        <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
          <div className="flex flex-col gap-6">
            <DataTable
              head={["Source", "Naming a problem", "Linked to an issue", "… with a ticket"]}
              rows={r.guestVoice.bySource.map((s) => [SOURCE[s.source] ?? s.source, fmtInt(s.withTopic), pctCell(s.linked, s.withTopic), pctCell(s.withTicket, s.withTopic)])}
              numeric={[1, 2, 3]}
            />
            <SurveyCompare r={r} />
          </div>
          <DataTable
            caption="What guests write about most in surveys and reviews"
            head={["Topic", "Category", "Mentions", "With a ticket", "Score /10"]}
            rows={r.guestVoice.byTopic.map((t) => [label(t.topic), label(t.category), fmtInt(t.mentions), pctCell(t.withTicket, t.mentions), fmtNum(t.avgScore, 1)])}
            numeric={[2, 3, 4]}
          />
        </div>
        {r.guestVoice.silent.length ? (
          <div className="flex flex-col gap-3">
            <h3 className="text-title-sm text-foreground">Problems guests write about that rarely became a ticket</h3>
            <ul className="grid gap-4 md:grid-cols-2">
              {r.guestVoice.silent.map((s) => (
                <li key={s.topic} className="flex flex-col gap-1 rounded-card bg-secondary p-4">
                  <span className="text-body-strong text-foreground">
                    {label(s.topic)} <span className="text-caption text-muted-foreground">· {label(s.category)}</span>
                  </span>
                  <span className="text-caption text-muted-foreground">
                    {fmtInt(s.mentions)} mentions, {fmtInt(s.withTicket)} with a ticket
                  </span>
                  {s.examples.map((e) => (
                    <p key={e.date + e.text} className="text-caption text-muted-soft">
                      {e.date}, {SOURCE[e.source] ?? e.source}: “{e.text}”
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Section>

      <Section title="5. Winter-works list" lead="Ranked by recurrence × (1 + guest reports) × (1 + repeat tickets). Each evidence line is written to be pasted into a budget request.">
        <DataTable
          head={["#", "Issue", "Where", "Priority", "Evidence"]}
          rows={r.winterWorks.map((w) => [String(w.rank), <IssueLink key={w.issueId} id={w.issueId} title={w.title} />, where(w), fmtInt(Math.round(w.priority)), w.evidence])}
          numeric={[0, 3]}
        />
      </Section>

      <Section title="6. Records assessment" lead="What the hotel's tools capture well, what they do not, and five changes to logging practice for next season.">
        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          <DataTable
            head={["Measure", "Value", "Verdict", "Note"]}
            rows={r.records.metrics.map((m) => [
              m.label,
              m.share === null ? fmtInt(m.count) : `${fmtPct(m.share)} (${fmtInt(m.count)} of ${fmtInt(m.total)})`,
              <VerdictBadge key={m.key} verdict={m.verdict} />,
              <span key={`${m.key}-note`} className="text-caption text-muted-foreground">
                {m.note}
              </span>,
            ])}
          />
          <Card>
            <CardHeader>
              <CardTitle>Five changes for next season</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ol className="flex list-decimal flex-col gap-2 pl-5 text-body text-foreground">
                {r.records.recommendations.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section title="Volume">
        <div className="grid gap-6 md:grid-cols-2">
          <DataTable head={["Source", "Records"]} rows={r.volume.bySource.map((s) => [SOURCE[s.source] ?? s.source, fmtInt(s.count)])} numeric={[1]} />
          <DataTable head={["Language", "Records with text"]} rows={r.volume.byLanguage.map((l) => [LANGUAGE[l.language] ?? l.language, fmtInt(l.count)])} numeric={[1]} />
        </div>
        <p className="text-caption text-muted-foreground">
          {fmtInt(r.volume.roomNights)} occupied room-nights in the season · generated {r.generatedAt.slice(0, 10)} · {r.version}
        </p>
      </Section>
    </article>
  );
}

function valid(s: string | undefined): string | undefined {
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
}

function Section({ title, lead, children }: { title: string; lead?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 break-inside-avoid-page">
      <div className="flex flex-col gap-1">
        <h2 className="text-title-md text-foreground">{title}</h2>
        {lead ? <p className="max-w-4xl text-body text-muted-foreground">{lead}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4">
        <span className="text-caption-strong uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="text-title-lg text-foreground tabular-nums">{value}</span>
        <span className="text-caption text-muted-soft">{hint}</span>
      </CardContent>
    </Card>
  );
}

function DataTable({ head, rows, numeric = [], caption }: { head: string[]; rows: React.ReactNode[][]; numeric?: number[]; caption?: string }) {
  return (
    <Card>
      <CardContent className="p-0">
        {caption ? <p className="px-4 pb-2 text-caption-strong text-muted-foreground">{caption}</p> : null}
        <Table>
          <TableHeader>
            <TableRow>
              {head.map((h, i) => (
                <TableHead key={h} className={numeric.includes(i) ? "text-right" : undefined}>
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={head.length} className="text-muted-foreground">
                  nothing in this period
                </TableCell>
              </TableRow>
            ) : null}
            {rows.map((row, ri) => (
              <TableRow key={ri}>
                {row.map((cell, ci) => (
                  <TableCell key={ci} className={numeric.includes(ci) ? "text-right tabular-nums" : "align-top"}>
                    {cell}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function IssueLink({ id, title }: { id: string; title: string }) {
  return (
    <Link href={`/issues/${id}`} className="text-body-strong text-foreground hover:underline focus-visible:shadow-focus focus-visible:outline-none">
      {title}
    </Link>
  );
}

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const v = { good: "success", weak: "warning", poor: "critical", info: "secondary" } as const;
  return <Badge variant={v[verdict]}>{verdict}</Badge>;
}

function SurveyCompare({ r }: { r: AuditReport }) {
  const s = r.guestVoice.surveys;
  const row = (name: string, g: typeof s.others) => [name, fmtInt(g.responses), fmtNum(g.avgOverall, 1), fmtNum(g.avgNps, 1), fmtPct(g.recommendShare)];
  return (
    <DataTable
      caption="Survey scores, guests whose stay had a logged issue against everyone else"
      head={["Guests", "Responses", "Overall /10", "NPS", "Would recommend"]}
      rows={[row("Stay linked to an issue", s.withLinkedIssue), row("Everyone else", s.others)]}
      numeric={[1, 2, 3, 4]}
    />
  );
}

function AuditSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <Skeleton className="h-12 w-2/3 rounded-sm" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-card" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-card" />
      <Skeleton className="h-80 rounded-card" />
    </div>
  );
}
