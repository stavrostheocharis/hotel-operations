import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { SourceBadge, StatusBadge } from "@/components/console/badges";
import { ConsoleShell } from "@/components/console/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { decideLink } from "@/console/actions";
import { fmtDate, fmtDateTime, METHOD, topicLabel } from "@/console/format";
import { getIssue, type IssueSignal } from "@/console/queries";
import { getCurrentTenant } from "@/console/tenant";
import { getAppDb } from "@/db";

export const metadata = { title: "Issue" };

/**
 * One issue: what it is, where the cause sits, the evidence in time order,
 * the tickets raised, and the outcomes. Every linked record shows the rule
 * (or model, or person) that put it here, and a supervisor can confirm or
 * reject it; both are pinned across rebuilds.
 */
export default function IssuePage(props: PageProps<"/issues/[id]">) {
  return (
    <ConsoleShell active="exceptions">
      <Suspense fallback={<IssueSkeleton />}>
        <IssueContent params={props.params} />
      </Suspense>
    </ConsoleShell>
  );
}

async function IssueContent({ params }: Pick<PageProps<"/issues/[id]">, "params">) {
  const { id } = await params;
  const tenant = await getCurrentTenant();
  const issue = await getIssue(getAppDb(), tenant, id);
  if (!issue) notFound();
  const tz = tenant.timezone;
  const closures = issue.actions.filter((a) => a.details.closed_at);
  const episodes = /(\d+) episodes?/.exec(issue.rootCause ?? "")?.[1] ?? "1";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/" className="text-caption text-muted-foreground hover:underline">
          ← Exceptions
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-display text-foreground">{issue.title}</h1>
          <StatusBadge status={issue.status} />
          <Badge variant="outline">{issue.severity}</Badge>
        </div>
        <p className="text-body text-muted-foreground">{issue.rootCause}</p>
        <p className="text-caption text-muted-soft">
          {issue.locationName ? `${issue.locationName} (${issue.locationCode}, ${issue.locationKind})` : "no location"} · opened {fmtDateTime(issue.openedAt, tz)}
          {issue.resolvedAt ? ` · last closure ${fmtDateTime(issue.resolvedAt, tz)}` : ""} · recurrence window {issue.recurrenceWindowDays} days
        </p>
      </div>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4" aria-label="Figures">
        <Figure label="Signals" value={String(issue.signals.length)} />
        <Figure label="Reopens" value={String(issue.reopenCount)} />
        <Figure label="Episodes" value={episodes} />
        <Figure label="Tickets closed" value={`${closures.length} of ${issue.actions.length}`} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Evidence</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-border p-0">
            {issue.signals.map((s) => (
              <SignalRow key={s.id} signal={s} issueId={issue.id} tz={tz} />
            ))}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Tickets</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 pt-0">
              {issue.actions.length === 0 ? <p className="text-body text-muted-foreground">No ticket was raised.</p> : null}
              {issue.actions.map((a) => (
                <div key={a.id} className="flex flex-col gap-0.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-body-strong text-foreground">#{a.externalRef}</span>
                    <span className="text-caption text-muted-foreground">{fmtDate(a.performedAt, tz)}</span>
                  </div>
                  <span className="text-caption text-muted-foreground">
                    {String(a.details.status ?? "")}
                    {a.details.closed_at ? ` · closed ${fmtDate(new Date(String(a.details.closed_at)), tz)}` : " · open"}
                    {a.actor ? ` · ${a.actor}` : ""}
                  </span>
                  {a.details.closure_note ? <span className="text-caption text-muted-soft">“{String(a.details.closure_note)}”</span> : null}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Outcomes</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 pt-0">
              {issue.outcomes.length === 0 ? <p className="text-body text-muted-foreground">No outcome recorded yet.</p> : null}
              {issue.outcomes.map((o) => (
                <div key={o.id} className="flex items-baseline justify-between gap-2">
                  <span className="text-body text-foreground">
                    {o.kind === "recurred" ? <Badge variant="critical">Came back</Badge> : o.kind === "no_recurrence" ? <Badge variant="secondary">No recurrence</Badge> : <Badge variant="success">{o.kind.replace(/_/g, " ")}</Badge>}
                  </span>
                  <span className="text-caption text-muted-foreground">{fmtDate(o.observedAt, tz)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SignalRow({ signal: s, issueId, tz }: { signal: IssueSignal; issueId: string; tz: string }) {
  const rule = String(s.evidence.rule ?? s.method);
  const text = s.textEn ?? s.textOriginal;
  const confirmed = s.method === "human" || s.decidedBy !== "system";
  return (
    <article className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-caption text-muted-foreground tabular-nums">{fmtDateTime(s.occurredAt, tz)}</span>
        <SourceBadge source={s.source} />
        {s.locationCode ? <span className="text-caption-strong text-foreground">{s.locationCode}</span> : null}
        <span className="text-caption text-muted-foreground">{topicLabel(s.topic, s.category)}</span>
        {s.role === "primary" ? <Badge variant="primary">first report</Badge> : null}
        {s.role === "duplicate" ? <Badge variant="secondary">duplicate</Badge> : null}
      </div>
      <p className="text-body text-foreground">{text ?? <span className="text-muted-soft">no text</span>}</p>
      {s.textEn && s.textOriginal && s.textEn !== s.textOriginal ? <p className="text-caption text-muted-soft">{s.textOriginal}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-caption text-muted-foreground">
          linked by {METHOD[s.method] ?? s.method}: {rule.replace(/[:_]/g, " ")}
          {s.confidence !== null ? ` · ${Math.round(s.confidence * 100)}%` : ""}
          {confirmed ? ` · ${s.decidedBy}` : ""}
        </span>
        {s.role !== "primary" && !confirmed ? (
          <form action={decideLink} className="ml-auto flex gap-2">
            <input type="hidden" name="issueId" value={issueId} />
            <input type="hidden" name="signalId" value={s.id} />
            <Button type="submit" name="decision" value="confirm" size="sm" variant="secondary">
              Confirm
            </Button>
            <Button type="submit" name="decision" value="reject" size="sm" variant="ghost">
              Not this issue
            </Button>
          </form>
        ) : null}
      </div>
    </article>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4">
        <span className="text-caption-strong uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="text-title-lg text-foreground tabular-nums">{value}</span>
      </CardContent>
    </Card>
  );
}

function IssueSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-10 w-2/3 rounded-sm" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-card" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-card" />
    </div>
  );
}
