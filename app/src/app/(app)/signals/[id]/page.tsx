import { notFound } from "next/navigation";
import { Suspense } from "react";

import { requireViewer } from "@/auth/viewer";
import { PageHeader } from "@/components/console/page-header";
import { PageSkeleton } from "@/components/console/page-skeleton";
import { RecordPanel } from "@/components/signals/record-panel";
import { fmtDateTime } from "@/console/format";
import { listAssignableUsers } from "@/console/issue-detail";
import { getSignal, listPlaces, suggestIssuesForSignal } from "@/console/signals";
import { getAppDb } from "@/db";
import { label, t } from "@/i18n";
import { canSee } from "@/auth/screens";
import { NotAllowed } from "@/components/console/not-allowed";

export const metadata = { title: t("signals.record.title") };

/** The same record as the drawer shows, as its own page (for links and for a wider view). */
export default function SignalPage(props: PageProps<"/signals/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      <Record params={props.params} />
    </Suspense>
  );
}

async function Record({ params }: Pick<PageProps<"/signals/[id]">, "params">) {
  const { id } = await params;
  const viewer = await requireViewer();
  if (!canSee(viewer.roleAt(), "signals")) return <NotAllowed />;
  const db = getAppDb();
  const rec = await getSignal(db, viewer.tenant, id);
  if (!rec) notFound();
  const tz = viewer.property.timezone;
  const [suggestions, places, users] = await Promise.all([suggestIssuesForSignal(db, viewer.tenant, rec), listPlaces(db, viewer.scoped), listAssignableUsers(db, viewer.scoped, viewer.property.id)]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[{ label: t("signals.title"), href: "/signals" }, { label: `#${rec.externalId}` }]}
        title={`${label("source", rec.source)} #${rec.externalId}`}
        description={`${fmtDateTime(rec.occurredAt, tz)}${rec.locationCode ? ` · ${rec.locationCode}` : ""}`}
      />
      <div className="flex max-w-3xl flex-col gap-6">
        <RecordPanel record={rec} suggestions={suggestions} places={places} users={users} tz={tz} canReview={viewer.can("signals.review")} canLink={viewer.can("links.decide")} />
      </div>
    </div>
  );
}
