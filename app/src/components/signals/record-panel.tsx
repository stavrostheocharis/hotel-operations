import Link from "next/link";

import { SourceBadge, StatusBadge } from "@/components/console/badges";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtDate, fmtDateTime } from "@/console/format";
import type { AssignableUser } from "@/console/issue-detail";
import type { IssueSuggestion, PlaceOption, SignalRecord } from "@/console/signals";
import { schema } from "@/db";
import { LANGUAGE } from "@/audit/markdown";
import { label, t } from "@/i18n";
import { CATEGORIES, TOPICS } from "@/normalize/taxonomy";
import { ClassificationForm, CreateIssueDialog, LinkButton, LinkSearch, PlacePicker } from "./record-tools";
import { needsTranslation } from "@/console/format";

/**
 * One record, in full: what it says, where and what the engine thinks it
 * is (with the controls to correct both), and which issue it belongs to
 * (with the controls to link it or start one). Shared by the drawer and
 * the page.
 */
export function RecordPanel({
  record,
  suggestions,
  places,
  users,
  tz,
  canReview,
  canLink,
}: {
  record: SignalRecord;
  suggestions: IssueSuggestion[];
  places: PlaceOption[];
  users: AssignableUser[];
  tz: string;
  canReview: boolean;
  canLink: boolean;
}) {
  const translated = record.textEn && record.textOriginal && record.textEn !== record.textOriginal;
  const categories = CATEGORIES.map((c) => ({ value: c, label: c.replace(/_/g, " ") }));
  const topics = Object.entries(TOPICS).map(([value, def]) => ({ value, label: value.replace(/_/g, " "), category: def.category }));
  const departments = schema.department.enumValues.map((d) => ({ value: d, label: label("user.department", d) }));
  const severities = schema.issueSeverity.enumValues.map((s) => ({ value: s, label: label("severity", s) }));
  const placeLocked = record.lockedFields.includes("location");
  const classLocked = record.lockedFields.includes("category") || record.lockedFields.includes("topic");
  const defaultTitle = `${(record.topic ?? record.category ?? "issue").replace(/_/g, " ")}${record.locationCode ? ` · ${record.locationCode}` : ""}`;

  return (
    <>
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
          <SourceBadge source={record.source} />
          <span>#{record.externalId}</span>
          <span>{fmtDateTime(record.occurredAt, tz)}</span>
          <span>· {t("signals.record.received", { when: fmtDate(record.receivedAt, tz) })}</span>
          {record.language ? (
            <span>
              · {t("signals.record.language")}: {LANGUAGE[record.language] ?? record.language}
              {record.languageConfidence !== null ? ` (${Math.round(record.languageConfidence * 100)}%)` : ""}
            </span>
          ) : null}
        </div>
        <p className="text-body-lg text-foreground">{record.text ?? <span className="text-muted-soft">{t("issue.noText")}</span>}</p>
        {translated ? (
          <p className="text-caption text-muted-foreground">
            {record.textOriginal} <span className="text-muted-soft">· {t("signals.record.translated")}</span>
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-3 rounded-card bg-secondary p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col">
            <span className="text-caption-strong uppercase tracking-wide text-muted-foreground">{t("signals.record.place")}</span>
            <span className="text-body text-foreground">
              {record.locationName ? `${record.locationName} · ${record.locationCode} · ${record.locationKind}` : t("signals.record.noPlace")}
              <span className="ml-2 text-caption text-muted-foreground">
                {placeLocked ? t("signals.record.locked") : label("signals.record.placeMethod", record.locationMethod)}
                {!placeLocked && record.locationConfidence !== null ? ` · ${Math.round(record.locationConfidence * 100)}%` : ""}
              </span>
            </span>
          </div>
          {canReview ? <PlacePicker signalId={record.id} places={places} currentId={record.locationId} /> : null}
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-caption-strong uppercase tracking-wide text-muted-foreground">
            {t("signals.record.classification")}
            {classLocked ? <span className="ml-2 font-normal normal-case tracking-normal">· {t("signals.record.locked")}</span> : null}
          </span>
          {canReview ? (
            <ClassificationForm signalId={record.id} category={record.category} topic={record.topic} categories={categories} topics={topics} />
          ) : (
            <span className="text-body text-foreground">{[record.category, record.topic].filter(Boolean).map((x) => String(x).replace(/_/g, " ")).join(" · ") || t("common.none")}</span>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <span className="text-caption-strong uppercase tracking-wide text-muted-foreground">{t("signals.record.belongs")}</span>
        {record.issues.length ? (
          <ul className="flex flex-col gap-2">
            {record.issues.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-2">
                <Link href={`/issues/${i.id}`} className="text-body-strong text-foreground hover:underline focus-visible:shadow-focus focus-visible:outline-none">
                  {i.title}
                </Link>
                <StatusBadge status={i.status} />
                <span className="text-caption text-muted-foreground">
                  {i.role} · {label("method", i.method)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body text-muted-foreground">{t("signals.record.notInIssue")}</p>
        )}
        {canLink ? (
          <div className="flex flex-col gap-3">
            {suggestions.length ? (
              <div className="flex flex-col gap-1">
                <span className="text-caption text-muted-foreground">{t("signals.record.suggestions")}</span>
                <ul className="flex flex-col divide-y divide-border rounded-lg bg-secondary">
                  {suggestions.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="flex min-w-0 flex-col">
                        <Link href={`/issues/${s.id}`} className="truncate text-body text-foreground hover:underline">
                          {s.title}
                        </Link>
                        <span className="text-caption text-muted-foreground">
                          {label("status", s.status)} · {s.reason} · {fmtDate(s.openedAt, tz)}
                        </span>
                      </div>
                      <LinkButton signalId={record.id} issueId={s.id} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-caption text-muted-foreground">{t("signals.record.noSuggestions")}</p>
            )}
            <LinkSearch signalId={record.id} />
            <div>
              <CreateIssueDialog signalId={record.id} defaultTitle={defaultTitle} category={record.category} categories={categories} severities={severities} departments={departments} users={users} />
            </div>
          </div>
        ) : null}
      </section>

      <Tabs defaultValue="text">
        <TabsList variant="line">
          <TabsTrigger value="text">{t("signals.record.text")}</TabsTrigger>
          <TabsTrigger value="fields">{t("signals.record.fields")}</TabsTrigger>
        </TabsList>
        <TabsContent value="text">
          <p className="whitespace-pre-wrap text-body text-foreground">{record.textOriginal ?? record.textEn ?? ""}</p>
          {needsTranslation(record.textEn, record.language) ? <p className="text-caption text-muted-soft">{t("signals.record.untranslated")}</p> : null}
          {record.normalized && Object.keys(record.normalized).length ? (
            <p className="mt-2 text-caption text-muted-soft">{summariseNormalized(record.normalized)}</p>
          ) : null}
        </TabsContent>
        <TabsContent value="fields">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-caption">
            {Object.entries(record.raw).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="text-foreground">{v === null || v === undefined || v === "" ? "–" : typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
              </div>
            ))}
          </dl>
        </TabsContent>
      </Tabs>
      {record.issues.some((i) => i.role === "primary") ? <Badge variant="primary">{t("issue.firstReport")}</Badge> : null}
    </>
  );
}

function summariseNormalized(n: Record<string, unknown>): string {
  const parts: string[] = [];
  if (n.version) parts.push(`normalised ${String(n.version)}`);
  if (n.language_method) parts.push(`language by ${String(n.language_method)}`);
  if (n.location_rule) parts.push(`place by ${String(n.location_rule)}`);
  const c = n.classification as { method?: string; confidence?: number } | undefined;
  if (c?.method) parts.push(`topic by ${c.method}${c.confidence ? ` (${Math.round(c.confidence * 100)}%)` : ""}`);
  if (n.place) parts.push(`moved from ${String(n.place)}`);
  return parts.join(" · ");
}
