import { CircleCheckIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { requireViewer } from "@/auth/viewer";
import { EmptyState } from "@/components/console/empty-state";
import { PageHeader } from "@/components/console/page-header";
import { PageSkeleton } from "@/components/console/page-skeleton";
import { RecentDecisionBadge, ReviewDeck, UndoButton } from "@/components/review/review-deck";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtDateTime } from "@/console/format";
import { countDecidedThisWeek, listDecidedPairs, listReviewPairs } from "@/console/review";
import { getAppDb } from "@/db";
import { t } from "@/i18n";
import { canSee } from "@/auth/screens";
import { NotAllowed } from "@/components/console/not-allowed";

export const metadata = { title: t("review.title") };

/** "Are these two records the same problem?" One pair at a time. */
export default function ReviewPage() {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<PageSkeleton variant="blocks" />}>
        <Queue />
      </Suspense>
    </div>
  );
}

async function Queue() {
  const viewer = await requireViewer();
  if (!canSee(viewer.roleAt(), "review")) return <NotAllowed />;
  const db = getAppDb();
  const tz = viewer.property.timezone;
  const [{ pairs, total }, recent, decidedThisWeek] = await Promise.all([listReviewPairs(db, viewer.scoped, { limit: 1 }), listDecidedPairs(db, viewer.scoped, 10), countDecidedThisWeek(db, viewer.scoped)]);
  const pair = pairs[0] ?? null;
  const canDecide = viewer.can("links.decide");
  return (
    <>
      <PageHeader title={t("review.title")} description={`${t("review.description")} ${t("review.strip", { n: total, d: decidedThisWeek })}`} />
      {!pair ? (
        <EmptyState icon={<CircleCheckIcon />} title={t("review.empty")} body={t("review.emptyHint")} />
      ) : canDecide ? (
        <ReviewDeck key={pair.id} pair={pair} tz={tz} />
      ) : (
        <EmptyState icon={<CircleCheckIcon />} title={t("common.notAllowed")} />
      )}
      {recent.length ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("review.recent")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-border pt-0">
            {recent.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-body text-foreground">
                    {d.aText ?? "–"} <span className="text-muted-foreground">↔</span> {d.bText ?? "–"}
                  </span>
                  <span className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
                    <RecentDecisionBadge decision={d.decision} />
                    <span>
                      {d.decidedByName ?? ""} · {fmtDateTime(d.decidedAt, tz)}
                    </span>
                    {d.attachedIssueId ? (
                      <Link href={`/issues/${d.attachedIssueId}`} className="hover:underline">
                        {t("review.toast.attached")}
                      </Link>
                    ) : null}
                  </span>
                </div>
                {canDecide ? <UndoButton suggestionId={d.id} /> : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
