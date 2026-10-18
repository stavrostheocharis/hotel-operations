import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment, Suspense } from "react";

import { requireViewer } from "@/auth/viewer";
import { SourceBadge, StatusBadge } from "@/components/console/badges";
import { PageHeader } from "@/components/console/page-header";
import { PageSkeleton } from "@/components/console/page-skeleton";
import { ActivityList } from "@/components/issues/activity-list";
import { NoteForm } from "@/components/issues/note-form";
import { WorkflowActions, type Option } from "@/components/issues/workflow-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtDate, fmtDateTime, topicLabel } from "@/console/format";
import { getIssueContext, listAssignableUsers } from "@/console/issue-detail";
import { listIssueVerifications } from "@/console/verification";
import { DoneSheet } from "@/components/verifications/done-sheet";
import { getIssue, type IssueDetail, type IssueSignal } from "@/console/queries";
import { defaultDepartmentFor, getPropertyProfile } from "@/console/property-settings";
import { getAppDb, schema } from "@/db";
import { label, t } from "@/i18n";
import { CATEGORIES } from "@/normalize/taxonomy";
import { LinkDecision } from "@/components/issues/link-decision";
import { needsTranslation } from "@/console/format";

export const metadata = { title: "Issue" };

/**
 * "What is this problem, who has it, and is it really fixed?"
 * One line says what / where / status / owner; one primary action per
 * status; the evidence, tickets, outcomes and activity as tabs; the place
 * and the people on the side.
 */
export default function IssuePage(props: PageProps<"/issues/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      <IssueContent params={props.params} />
    </Suspense>
  );
}

const EPISODE_GAP_MS = 7 * 86_400_000;

async function IssueContent({ params }: Pick<PageProps<"/issues/[id]">, "params">) {
  const { id } = await params;
  const viewer = await requireViewer();
  const db = getAppDb();
  // Read with every property the viewer may see, so a shared link opens.
  const issue = await getIssue(db, viewer.tenant, id);
  if (!issue) notFound();
  const [context, users, checks] = await Promise.all([
    getIssueContext(db, viewer.tenant, id, issue.locationId),
    listAssignableUsers(db, viewer.tenant, viewer.property.id),
    listIssueVerifications(db, viewer.tenant, id),
  ]);
  const tz = viewer.property.timezone;
  const scope = { department: issue.department as never, ownerUserId: issue.ownerUserId };
  const can = {
    assign: viewer.can("issue.assign", scope),
    status: viewer.can("issue.status", scope),
    verify: viewer.can("issue.verify", scope),
    edit: viewer.can("issue.edit"),
    close: viewer.can("settings.property"),
    schedule: viewer.can("verification.schedule", scope),
    note: viewer.can("issue.note"),
    decide: viewer.can("links.decide"),
  };
  const departments: Option[] = schema.department.enumValues.map((d) => ({ value: d, label: label("user.department", d) }));
  const categories: Option[] = CATEGORIES.map((c) => ({ value: c, label: label("category", c) }));
  const profile = await getPropertyProfile(db, viewer.tenant, viewer.property.id);
  const defaultDepartment = issue.department ?? defaultDepartmentFor(issue.category, profile?.settings);
  const severities: Option[] = schema.issueSeverity.enumValues.map((s) => ({ value: s, label: label("severity", s) }));
  const statuses: Option[] = schema.issueStatus.enumValues.map((s) => ({ value: s, label: label("status", s) }));
  const closures = issue.actions.filter((a) => a.details.closed_at);
  const lastClosure = closures.reduce<Date | null>((m, a) => {
    const d = new Date(String(a.details.closed_at));
    return !m || d > m ? d : m;
  }, null);
  const windowEnds = lastClosure ? new Date(lastClosure.getTime() + issue.recurrenceWindowDays * 86_400_000) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[{ label: t("issue.back"), href: "/exceptions" }, { label: issue.title }]}
        title={issue.title}
        badge={
          <>
            <StatusBadge status={issue.status} />
            {issue.reopenCount > 0 ? <Badge variant="critical">{t("issue.header.back", { n: issue.reopenCount })}</Badge> : null}
            {issue.severity === "critical" || issue.severity === "high" ? <Badge variant="outline">{label("severity", issue.severity)}</Badge> : null}
          </>
        }
        actions={
          can.assign || can.status || can.verify || can.edit ? (
            <WorkflowActions
              issue={{ id: issue.id, title: issue.title, status: issue.status, category: issue.category, severity: issue.severity, department: defaultDepartment, ownerUserId: issue.ownerUserId, ownerName: issue.ownerName }}
              users={users}
              departments={departments}
              categories={categories}
              severities={severities}
              statuses={statuses}
              can={{ assign: can.assign, status: can.status, verify: can.verify, edit: can.edit, close: can.close, schedule: can.schedule }}
            />
          ) : null
        }
        description={<HeaderLine issue={issue} servesCount={context.serves.length} tz={tz} />}
      />

      {issue.supersededAt ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-body text-foreground">{t("issue.header.superseded", { when: fmtDate(issue.supersededAt, tz) })}</p>
            {issue.supersededByIssueId ? (
              <Button variant="secondary" render={<Link href={`/issues/${issue.supersededByIssueId}`} />}>
                {t("issue.header.supersededOpen")}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Tabs defaultValue="evidence" className="min-w-0">
          <TabsList className="max-w-full overflow-x-auto" variant="line">
            <TabsTrigger value="evidence">
              {t("issue.tabs.evidence")} · {issue.signals.length}
            </TabsTrigger>
            <TabsTrigger value="tickets">
              {t("issue.tabs.tickets")} · {issue.actions.length}
            </TabsTrigger>
            <TabsTrigger value="outcomes">
              {t("issue.tabs.outcomes")} · {issue.outcomes.length}
            </TabsTrigger>
            <TabsTrigger value="activity">
              {t("issue.tabs.activity")} · {context.events.length}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="evidence">
            <Card>
              <CardContent className="flex flex-col divide-y divide-border p-0">
                <Evidence signals={issue.signals} issueId={issue.id} tz={tz} canDecide={can.decide} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tickets">
            <Card>
              <CardContent className="flex flex-col gap-4">
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
                    {a.details.closure_note ? <span className="text-body text-muted-foreground">“{String(a.details.closure_note)}”</span> : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="outcomes">
            <Card>
              <CardContent className="flex flex-col gap-4">
                <p className="text-caption text-muted-foreground">
                  {t("issue.window", { days: issue.recurrenceWindowDays })}
                  {windowEnds ? ` (${fmtDate(lastClosure!, tz)} → ${fmtDate(windowEnds, tz)})` : ""}
                </p>
                {issue.outcomes.length === 0 ? <p className="text-body text-muted-foreground">{t("issue.noOutcome")}</p> : null}
                {issue.outcomes.map((o) => (
                  <div key={o.id} className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <Badge variant={o.kind === "recurred" ? "critical" : o.kind === "no_recurrence" ? "secondary" : "success"}>{label("issue.outcomeKind", o.kind)}</Badge>
                      <span className="text-caption text-muted-foreground">{fmtDate(o.observedAt, tz)}</span>
                    </div>
                    {o.evidence.note ? <p className="text-body text-muted-foreground">“{String(o.evidence.note)}”</p> : null}
                  </div>
                ))}
                <h3 className="mt-2 text-caption-strong uppercase tracking-wide text-muted-foreground">{t("issue.checks")}</h3>
                {checks.length === 0 ? <p className="text-body text-muted-foreground">{t("issue.noChecks")}</p> : null}
                {checks.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-body text-foreground">
                        {fmtDate(c.dueAt, tz)}
                        {c.assigneeName ? ` · ${c.assigneeName}` : ""}
                      </span>
                      <span className="text-caption text-muted-foreground">
                        {c.status === "done" && c.result ? label("issue.outcomeKind", c.result) : label("verifications.status", c.status)}
                        {c.instructions ? ` · ${c.instructions}` : ""}
                      </span>
                    </div>
                    {c.status === "open" && viewer.can("verification.complete", { ownerUserId: c.assigneeUserId, department: c.assigneeDepartment as never }) ? (
                      <DoneSheet taskId={c.id} issueTitle={issue.title} place={issue.locationName ?? issue.locationCode ?? ""} canSkip={can.schedule} />
                    ) : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity">
            <Card>
              <CardContent className="flex flex-col gap-4">
                {can.note ? <NoteForm issueId={issue.id} /> : null}
                <ActivityList events={context.events} tz={tz} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <aside className="flex flex-col gap-6">
          <Card>
            <CardContent className="flex flex-col gap-3">
              <h2 className="text-title-sm text-foreground">{t("issue.aside.where")}</h2>
              {context.chain.length ? (
                <ol className="flex flex-col gap-1 text-body">
                  {context.chain.map((p, i) => (
                    <li key={p.id} className={i === 0 ? "text-foreground" : "text-muted-foreground"}>
                      {p.name} <span className="text-caption text-muted-foreground">· {p.code} · {p.kind}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-body text-muted-foreground">{t("issue.meta.noLocation")}</p>
              )}
              {context.servedBy.length ? (
                <p className="text-caption text-muted-foreground">
                  <span className="text-caption-strong text-foreground">{t("issue.aside.servedBy")}:</span> {context.servedBy.map((s) => `${s.name} (${s.code})`).join(", ")}
                </p>
              ) : null}
              {context.serves.length ? (
                <p className="text-caption text-muted-foreground">
                  <span className="text-caption-strong text-foreground">{t("issue.aside.serves")}:</span> {context.serves.map((s) => s.code).join(", ")}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-3">
              <h2 className="text-title-sm text-foreground">{t("issue.aside.related")}</h2>
              {context.related.length === 0 ? <p className="text-body text-muted-foreground">{t("issue.aside.noRelated")}</p> : null}
              {context.related.map((r) => (
                <div key={r.id} className="flex flex-col gap-0.5">
                  <Link href={`/issues/${r.id}`} className="text-body-strong text-foreground hover:underline focus-visible:shadow-focus focus-visible:outline-none">
                    {r.title}
                  </Link>
                  <div className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
                    <StatusBadge status={r.status} />
                    {r.reopenCount > 0 ? <span>{t("issue.header.back", { n: r.reopenCount })}</span> : null}
                    <span>{fmtDate(r.openedAt, tz)}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-2 text-body">
              <h2 className="text-title-sm text-foreground">{t("issue.aside.people")}</h2>
              <Row k={t("issue.aside.owner")} v={issue.ownerName ?? t("issue.aside.nobody")} />
              <Row k={t("issue.aside.department")} v={issue.department ? label("user.department", issue.department) : "–"} />
              {issue.verifiedByName ? <Row k={t("issue.aside.verifiedBy")} v={issue.verifiedByName} /> : null}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function HeaderLine({ issue, servesCount, tz }: { issue: IssueDetail; servesCount: number; tz: string }) {
  const parts: string[] = [];
  parts.push(issue.category ? issue.category.replace(/_/g, " ") : "unclassified");
  if (issue.locationName) parts.push(`${issue.locationName} (${issue.locationCode}, ${issue.locationKind})${servesCount ? ` · ${t("issue.header.serves", { n: servesCount })}` : ""}`);
  else parts.push(t("issue.meta.noLocation"));
  parts.push(issue.ownerName ? t("issue.header.owner", { name: `${issue.ownerName}${issue.department ? `, ${label("user.department", issue.department)}` : ""}` }) : t("issue.header.noOwner"));
  parts.push(t("issue.header.openSince", { when: fmtDate(issue.openedAt, tz) }));
  if (issue.statusSource === "human") parts.push(t("issue.header.statusByHand"));
  return (
    <>
      <span className="text-body text-foreground">{parts.join(" · ")}</span>
      {issue.rootCause ? (
        <>
          <br />
          <span className="text-caption text-muted-soft">{issue.rootCause}</span>
        </>
      ) : null}
    </>
  );
}

function Evidence({ signals, issueId, tz, canDecide }: { signals: IssueSignal[]; issueId: string; tz: string; canDecide: boolean }) {
  let episode = 0;
  return (
    <>
      {signals.map((s, i) => {
        const gap = i === 0 || s.occurredAt.getTime() - signals[i - 1].occurredAt.getTime() > EPISODE_GAP_MS;
        if (gap) episode++;
        return (
          <Fragment key={s.id}>
            {gap && signals.length > 1 ? (
              <p className="bg-secondary px-4 py-1.5 text-caption-strong text-muted-foreground">{t("issue.episode", { n: episode, date: fmtDate(s.occurredAt, tz) })}</p>
            ) : null}
            <SignalRow signal={s} issueId={issueId} tz={tz} canDecide={canDecide} />
          </Fragment>
        );
      })}
    </>
  );
}

function SignalRow({ signal: s, issueId, tz, canDecide }: { signal: IssueSignal; issueId: string; tz: string; canDecide: boolean }) {
  const rule = String(s.evidence.rule ?? s.method);
  const text = s.textEn ?? s.textOriginal;
  const confirmed = s.method === "human" || s.decidedBy !== "system";
  const reason = Object.entries(s.evidence)
    .filter(([k]) => k !== "rule")
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
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
      {needsTranslation(s.textEn, s.language) ? <p className="text-caption text-muted-soft">{t("signals.record.untranslated")}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-caption text-muted-foreground" title={reason || undefined}>
          {confirmed ? `${label("method", "human")} · ${s.decidedByName ?? s.decidedBy}` : `${rule.replace(/[:_]/g, " ")}${s.confidence !== null ? ` · ${Math.round(s.confidence * 100)}%` : ""}`}
        </span>
        {canDecide && s.role !== "primary" && !confirmed ? (
          <LinkDecision issueId={issueId} signalId={s.id} />
        ) : null}
      </div>
    </article>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-caption text-muted-foreground">{k}</span>
      <span className="text-right text-body text-foreground">{v}</span>
    </div>
  );
}
