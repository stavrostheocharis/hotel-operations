"use client";

import Link from "next/link";
import { useEffect, useTransition } from "react";
import { toast } from "sonner";

import { SourceBadge, StatusBadge } from "@/components/console/badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { fmtDateTime } from "@/console/format";
import type { ReviewPair, ReviewSide } from "@/console/review";
import type { PairVerdict } from "@/console/review";
import { decidePairAction, undoPairAction } from "@/console/review-actions";
import { t } from "@/i18n";
import { needsTranslation } from "@/console/format";
import { topicLabel } from "@/console/format";

/** One pair at a time, side by side; S / N / K on the keyboard. */
export function ReviewDeck({ pair, tz }: { pair: ReviewPair; tz: string }) {
  const [pending, start] = useTransition();
  const decide = (verdict: PairVerdict) =>
    start(async () => {
      const res = await decidePairAction(pair.id, verdict);
      if (res.ok)
        toast.success(res.message, verdict === "skip" ? undefined : {
          action: {
            label: t("review.undo"),
            onClick: () =>
              start(async () => {
                const undone = await undoPairAction(pair.id);
                if (undone.ok) toast.success(undone.message);
                else toast.error(undone.message, { duration: Infinity, closeButton: true });
              }),
          },
        });
      else toast.error(res.message, { duration: Infinity, closeButton: true });
    });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || pending) return;
      if ((e.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable], [role=menu], [role=menuitem], [role=listbox], [role=option], [role=combobox], [role=dialog]")) return;
      const k = e.key.toLowerCase();
      if (k === "s") decide("same");
      else if (k === "n") decide("different");
      else if (k === "k") decide("skip");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pair.id, pending]);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Side side={pair.a} tz={tz} />
        <Side side={pair.b} tz={tz} />
      </div>
      <p className="text-caption text-muted-foreground">
        {t("review.reason", { rule: pair.rule.replace(/[:_]/g, " "), score: pair.score.toFixed(2), model: pair.model })}
        {pair.verdict ? ` · ${t("review.modelSaid", { verdict: pair.verdict, reason: pair.reason ?? "" })}` : ""}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => decide("same")} disabled={pending}>
          {t("review.same")}
        </Button>
        <Button variant="secondary" onClick={() => decide("different")} disabled={pending}>
          {t("review.different")}
        </Button>
        <Button variant="ghost" onClick={() => decide("skip")} disabled={pending}>
          {t("review.skip")}
        </Button>
        <span className="ml-auto text-caption text-muted-foreground">{t("review.keys")}</span>
      </div>
    </div>
  );
}

function Side({ side, tz }: { side: ReviewSide; tz: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
          <SourceBadge source={side.source} />
          <span>#{side.externalId}</span>
          <span>{fmtDateTime(side.occurredAt, tz)}</span>
        </div>
        <div className="text-caption text-muted-foreground">
          {side.locationName ? `${side.locationName} · ${side.locationCode}` : t("signals.noPlace")}
          {side.topic || side.category ? ` · ${topicLabel(side.topic, side.category)}` : ""}
        </div>
        <p className="text-body text-foreground">{side.textEn ?? side.textOriginal ?? ""}</p>
        {needsTranslation(side.textEn, side.language) ? <p className="text-caption text-muted-soft">{t("signals.record.untranslated")}</p> : null}
        {side.textEn && side.textOriginal && side.textEn !== side.textOriginal ? <p className="text-caption text-muted-soft">{side.textOriginal}</p> : null}
        <div className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
          {side.issueId ? (
            <>
              <span>{t("review.currentlyIn")}:</span>
              <Link href={`/issues/${side.issueId}`} className="text-foreground hover:underline">
                {side.issueTitle}
              </Link>
            </>
          ) : (
            <span>{t("review.notInIssue")}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function UndoButton({ suggestionId }: { suggestionId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await undoPairAction(suggestionId);
          if (res.ok) toast.success(res.message);
          else toast.error(res.message, { duration: Infinity, closeButton: true });
        })
      }
    >
      {t("review.undo")}
    </Button>
  );
}

export function RecentDecisionBadge({ decision }: { decision: string }) {
  return <StatusBadge status={decision === "accepted" ? "verified" : "closed_unverified"} />;
}
