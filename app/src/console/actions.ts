"use server";

import { refresh } from "next/cache";
import { assertCan } from "@/auth/permissions";
import { requireViewer } from "@/auth/viewer";
import { getAppDb } from "@/db";
import { t } from "@/i18n";
import { failureMessage } from "./action-errors";
import { applyLinkDecision } from "./decisions";
import type { ActionResult } from "./issue-actions";

/**
 * Server action behind the confirm / reject buttons on an issue's timeline.
 * The actor is the signed-in user; the decision itself is pinned on the
 * signal pair, so a later rebuild keeps it.
 */
export async function decideLink(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const issueId = String(formData.get("issueId") ?? "");
    const signalId = String(formData.get("signalId") ?? "");
    const decision = String(formData.get("decision") ?? "");
    if (!issueId || !signalId || (decision !== "confirm" && decision !== "reject")) throw new Error("invalid link decision");
    const viewer = await requireViewer();
    assertCan(viewer.actor(), "links.decide");
    await applyLinkDecision(getAppDb(), viewer.tenant, { issueId, signalId, decision, decidedBy: viewer.user.id });
    refresh();
    return { ok: true, message: decision === "confirm" ? t("issue.toast.confirmed") : t("issue.toast.rejected"), at: Date.now() };
  } catch (err) {
    return { ok: false, message: failureMessage(err), at: Date.now() };
  }
}
