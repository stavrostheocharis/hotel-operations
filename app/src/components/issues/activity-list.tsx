import { fmtDateTime } from "@/console/format";
import type { IssueEvent } from "@/console/issue-detail";
import { label, t } from "@/i18n";

/** The issue's history as sentences, newest first. Notes show their text. */
export function ActivityList({ events, tz }: { events: IssueEvent[]; tz: string }) {
  if (!events.length) return <p className="text-body text-muted-foreground">{t("issue.activity.empty")}</p>;
  return (
    <ol className="flex flex-col divide-y divide-border">
      {events.map((e) => (
        <li key={e.id} className="flex flex-col gap-1 py-3">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-caption text-muted-foreground tabular-nums">{fmtDateTime(e.occurredAt, tz)}</span>
            <span className="text-caption-strong text-foreground">{e.actorName ?? (e.actor === "system" ? t("issue.activity.engine") : e.actor)}</span>
          </div>
          <p className={e.type === "issue.note" ? "whitespace-pre-wrap text-body text-foreground" : "text-body text-muted-foreground"}>{sentence(e)}</p>
        </li>
      ))}
    </ol>
  );
}

function sentence(e: IssueEvent): string {
  const p = e.payload;
  switch (e.type) {
    case "issue.note":
      return String(p.text ?? "");
    case "issue.detected":
      return t("issue.activity.detected", { n: Number(p.signals ?? 0) });
    case "issue.assigned":
      if (p.owner_user_id) return t("issue.activity.assignedTo", { name: String(p.owner_name ?? "") || "owner" });
      if (p.department) return t("issue.activity.assignedDept", { department: label("user.department", String(p.department)) });
      return t("issue.activity.unassigned");
    case "issue.status_changed": {
      const base = t("issue.activity.statusChanged", { from: label("status", String(p.from ?? "")), to: label("status", String(p.to ?? "")) });
      return p.reason ? `${base} — ${String(p.reason)}` : base;
    }
    case "issue.verified":
      return t("issue.activity.verified", { result: label("issue.outcomeKind", String(p.result ?? "")) });
    case "issue.reopened":
      return t("issue.activity.reopened");
    case "issue.resolved":
      return t("issue.activity.resolved");
    case "issue.rebuilt":
      return t("issue.activity.rebuilt");
    case "issue.superseded":
      return t("issue.activity.superseded");
    case "issue.link_confirmed":
      return t("issue.activity.linkConfirmed");
    case "issue.link_rejected":
      return t("issue.activity.linkRejected");
    case "issue.edited":
      return t("issue.activity.edited", { fields: Object.keys(p).join(", ") });
    default:
      return e.type;
  }
}
