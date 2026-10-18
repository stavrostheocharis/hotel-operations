"use server";

import { refresh } from "next/cache";
import { requireViewer } from "@/auth/viewer";
import { getAppDb } from "@/db";
import { t } from "@/i18n";
import type { ActionResult } from "./issue-actions";
import { decidePair, undoPairDecision, type PairVerdict } from "./review";
import { failureMessage } from "./action-errors";

async function run(fn: () => Promise<string>): Promise<ActionResult> {
  try {
    const message = await fn();
    refresh();
    return { ok: true, message, at: Date.now() };
  } catch (err) {
    return { ok: false, message: failureMessage(err), at: Date.now() };
  }
}

export async function decidePairAction(suggestionId: string, verdict: PairVerdict): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    const res = await decidePair(getAppDb(), viewer.tenant, viewer.actor(), { suggestionId, verdict });
    if (verdict === "skip") return t("review.toast.skipped");
    if (verdict === "different") return t("review.toast.different");
    if (res.attachedIssueId) return t("review.toast.attached");
    if (res.merged) return t("review.toast.merges");
    return t("review.toast.same");
  });
}

export async function undoPairAction(suggestionId: string): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    await undoPairDecision(getAppDb(), viewer.tenant, viewer.actor(), { suggestionId });
    return t("review.toast.undone");
  });
}
