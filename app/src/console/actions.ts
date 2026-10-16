"use server";

import { refresh } from "next/cache";
import { getAppDb } from "@/db";
import { applyLinkDecision } from "./decisions";
import { getCurrentTenant } from "./tenant";

/**
 * Server action behind the confirm / reject buttons on an issue's timeline.
 * Until sign-in exists the actor is "supervisor"; the decision itself is
 * pinned on the signal pair, so a later rebuild keeps it.
 */
export async function decideLink(formData: FormData) {
  const issueId = String(formData.get("issueId") ?? "");
  const signalId = String(formData.get("signalId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!issueId || !signalId || (decision !== "confirm" && decision !== "reject")) {
    throw new Error("invalid link decision");
  }
  const tenant = await getCurrentTenant();
  await applyLinkDecision(getAppDb(), tenant, { issueId, signalId, decision, decidedBy: "supervisor" });
  refresh();
}
