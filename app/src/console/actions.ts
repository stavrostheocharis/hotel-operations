"use server";

import { refresh } from "next/cache";
import { assertCan } from "@/auth/permissions";
import { requireViewer } from "@/auth/viewer";
import { getAppDb } from "@/db";
import { applyLinkDecision } from "./decisions";

/**
 * Server action behind the confirm / reject buttons on an issue's timeline.
 * The actor is the signed-in user; the decision itself is pinned on the
 * signal pair, so a later rebuild keeps it.
 */
export async function decideLink(formData: FormData) {
  const issueId = String(formData.get("issueId") ?? "");
  const signalId = String(formData.get("signalId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!issueId || !signalId || (decision !== "confirm" && decision !== "reject")) {
    throw new Error("invalid link decision");
  }
  const viewer = await requireViewer();
  assertCan(viewer.actor(), "links.decide");
  await applyLinkDecision(getAppDb(), viewer.tenant, { issueId, signalId, decision, decidedBy: viewer.user.id });
  refresh();
}
