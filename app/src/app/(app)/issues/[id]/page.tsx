import { notFound } from "next/navigation";
import { Suspense } from "react";

import { requireViewer } from "@/auth/viewer";
import { SourceBadge, StatusBadge } from "@/components/console/badges";
import { PageHeader } from "@/components/console/page-header";
import { PageSkeleton } from "@/components/console/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { decideLink } from "@/console/actions";
import { fmtDate, fmtDateTime, topicLabel } from "@/console/format";
import { getIssue, type IssueSignal } from "@/console/queries";
import { getAppDb } from "@/db";
import { label, t } from "@/i18n";

export const metadata = { title: "Issue" };

/**
 * One issue: what it is, where the cause sits, the evidence in time order,
 * the tickets raised, and the outcomes. Every linked record shows the rule
 * (or model, or person) that put it here, and a supervisor can confirm or
 * reject it; both are pinned across rebuilds.
 */
export default function IssuePage(props: PageProps<"/issues/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      <IssueContent params={props.params} />
    </Suspense>
  );
}

async function IssueContent({ params }: Pick<PageProps<"/issues/[id]">, "params">) {
  const { id } = await params;
  const viewer = await requireViewer();
  // Read with every property the viewer may see, so a shared link opens.
  const issue = await getIssue(getAppDb(), viewer.tenant, id);
  if (!issue) notFound();
  const tz = viewer.property.timezone;
  const canDecide = viewer.can("links.decide");
  const closures = issue.actions.filter((a) => a.details.closed_at);
  const episodes = /(\d+) episodes?/.exec(issue.rootCause ?? "")?.[1] ?? "1";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[{ label: t("issue.back"), href: "/exceptions" }, { label: issue.title }]}
        title={issue.title}
        badge={
          <>
            <StatusBadge status={issue.status} />
            <Badge variant="outline">{issue.severity}</Badge>
          </>
        }
        description={
          <>
            {issue.rootCause}
            <br />
            <span className="text-caption text-muted-soft">
              {issue.locationName ? `${issue.locationName} (${issue.locationCode}, ${issue.locationKind})` : t("issue.meta.noLocation")} ·{" "}
              {t("issue.meta.opened", { when: fmtDateTime(issue.openedAt, tz) })}
              {issue.resolvedAt ? ` · ${t("issue.meta.lastClosure", { when: fmtDateTime(issue.resolvedAt, tz) })}` : ""} ·{" "}
              {t("issue.meta.window", { days: issue.recurrenceWindowDays })}
            </span>
          </>
        }
      />

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4" aria-label="Figures">
        <Figure label={t("issue.figures.signals")} value={String(issue.signals.length)} />
        <Figure label={t("issue.figures.reopens")} value={String(issue.reopenCount)} />
        <Figure label={t("issue.figures.episodes")} value={episodes} />
        <Figure label={t("issue.figures.ticketsClosed")} value={`${closures.length} of ${issue.actions.length}`} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t("issue.evidence")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-border p-0">
            {issue.signals.map((s) => (
              <SignalRow key={s.id} signal={s} issueId={issue.id} tz={tz} canDecide={canDecide} />
            ))}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("issue.tickets")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 pt-0">
              {issue.actions.length === 0 ? <p className="text-body text-muted-foreground">{t("issue.noTicket")}</p> : null}
              {issue.actions.map((a) => (
                <div key={a.id} className="flex flex-col gap-0.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-body-strong text-foreground">#{a.externalRef}</span>
                    <span className="text-caption text-muted-foreground">{fmtDate(a.performedAt, tz)}</span>
                  </div>
                  <span className="text-caption text-muted-foreground">
                    {String(a.details.status ?? "")}
                    {a.details.closed_at ? ` · ${t("issue.meta.closed", { when: fmtDate(new Date(String(a.details.closed_at)), tz) })}` : ` · ${t("issue.meta.open")}`}
                  </span>
                  {a.details.closure_note ? <span className="text-caption text-muted-soft">“{String(a.details.closure_note)}”</span> : null}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("issue.outcomes")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 pt-0">
              {issue.outcomes.length === 0 ? <p className="text-body text-muted-foreground">{t("issue.noOutcome")}</p> : null}
              {issue.outcomes.map((o) => (
                <div key={o.id} className="flex items-baseline justify-between gap-2">
                  <span className="text-body text-foreground">
                    {o.kind === "recurred" ? (
                      <Badge variant="critical">{t("issue.cameBack")}</Badge>
                    ) : o.kind === "no_recurrence" ? (
                      <Badge variant="secondary">{t("issue.noRecurrence")}</Badge>
                    ) : (
                      <Badge variant="success">{o.kind.replace(/_/g, " ")}</Badge>
                    )}
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

function SignalRow({ signal: s, issueId, tz, canDecide }: { signal: IssueSignal; issueId: string; tz: string; canDecide: boolean }) {
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
        {s.role === "primary" ? <Badge variant="primary">{t("issue.firstReport")}</Badge> : null}
        {s.role === "duplicate" ? <Badge variant="secondary">{t("issue.duplicate")}</Badge> : null}
      </div>
      <p className="text-body text-foreground">{text ?? <span className="text-muted-soft">{t("issue.noText")}</span>}</p>
      {s.textEn && s.textOriginal && s.textEn !== s.textOriginal ? <p className="text-caption text-muted-soft">{s.textOriginal}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-caption text-muted-foreground">
          {t("issue.linkedBy", { method: label("method", s.method), rule: rule.replace(/[:_]/g, " ") })}
          {s.confidence !== null ? ` · ${Math.round(s.confidence * 100)}%` : ""}
          {confirmed ? ` · ${s.decidedByName ?? s.decidedBy}` : ""}
        </span>
        {canDecide && s.role !== "primary" && !confirmed ? (
          <form action={decideLink} className="ml-auto flex gap-2">
            <input type="hidden" name="issueId" value={issueId} />
            <input type="hidden" name="signalId" value={s.id} />
            <Button type="submit" name="decision" value="confirm" variant="secondary">
              {t("issue.confirm")}
            </Button>
            <Button type="submit" name="decision" value="reject" variant="ghost">
              {t("issue.reject")}
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
