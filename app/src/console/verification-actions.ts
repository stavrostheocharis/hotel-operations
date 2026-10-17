"use server";

import { refresh } from "next/cache";
import { AuthorizationError } from "@/auth/permissions";
import { requireViewer } from "@/auth/viewer";
import { getAppDb } from "@/db";
import { t } from "@/i18n";
import type { ActionResult } from "./issue-actions";
import { completeVerification, scheduleVerification, skipVerification, type CompletionResult } from "./verification";

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};
const opt = (fd: FormData, k: string) => str(fd, k).trim() || null;

/** A calendar date from a date input, as noon in the property's day (so the day never shifts). */
export async function noonOf(date: string | null): Promise<Date | null> {
  return date ? new Date(`${date}T12:00:00`) : null;
}

async function run(fn: () => Promise<string>): Promise<ActionResult> {
  try {
    const message = await fn();
    refresh();
    return { ok: true, message, at: Date.now() };
  } catch (err) {
    if (err instanceof AuthorizationError) return { ok: false, message: t("common.notAllowed"), at: Date.now() };
    return { ok: false, message: err instanceof Error ? err.message : String(err), at: Date.now() };
  }
}

export async function scheduleVerificationAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    const due = (await noonOf(opt(fd, "dueOn"))) ?? new Date(Date.now() + 2 * 86_400_000);
    const assignee = opt(fd, "assigneeUserId");
    await scheduleVerification(getAppDb(), viewer.tenant, viewer.actor(), {
      issueId: str(fd, "issueId"),
      dueAt: due,
      instructions: opt(fd, "instructions"),
      assigneeUserId: assignee === "none" ? null : assignee,
    });
    return t("verifications.toast.scheduled", { date: due.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) });
  });
}

export async function completeVerificationAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    const result = str(fd, "result") as CompletionResult;
    const note = opt(fd, "note");
    if ((result === "recurred" || result === "could_not") && !note) throw new Error(t("verifications.sheet.noteRequired"));
    const rescheduleTo = await noonOf(opt(fd, "rescheduleTo"));
    const observedAt = await noonOf(opt(fd, "observedAt"));
    const res = await completeVerification(getAppDb(), viewer.tenant, viewer.actor(), { taskId: str(fd, "taskId"), result, note, observedAt, rescheduleTo });
    if (res.status === "open") return t("verifications.toast.rescheduled", { date: (rescheduleTo ?? new Date()).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) });
    return res.issueStatus === "verified" ? t("verifications.toast.held") : t("verifications.toast.cameBack");
  });
}

export async function skipVerificationAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    await skipVerification(getAppDb(), viewer.tenant, viewer.actor(), { taskId: str(fd, "taskId"), reason: opt(fd, "reason") });
    return t("verifications.toast.skipped");
  });
}
