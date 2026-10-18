"use server";

import { refresh } from "next/cache";
import { requireViewer } from "@/auth/viewer";
import { getAppDb } from "@/db";
import { label, t } from "@/i18n";
import { addIssueNote, assignIssue, changeIssueStatus, editIssue, recordOutcome, resolveIssue, type OutcomeResult } from "./issue-workflow";
import { scheduleVerification } from "./verification";
import { failureMessage } from "./action-errors";

/**
 * The server actions behind the issue page's dialogs. Each one
 * re-authenticates, delegates to issue-workflow.ts, refreshes the page and
 * returns a sentence for the toast; failures come back as `ok: false` with
 * the reason, never as a thrown error the form cannot show.
 */
export type ActionResult = { ok: boolean; message: string; at: number };

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};
const opt = (fd: FormData, k: string) => str(fd, k).trim() || null;

async function run(fn: () => Promise<string>): Promise<ActionResult> {
  try {
    const message = await fn();
    refresh();
    return { ok: true, message, at: Date.now() };
  } catch (err) {
    return { ok: false, message: failureMessage(err), at: Date.now() };
  }
}

export async function assignIssueAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    const chosen = opt(fd, "ownerUserId");
    const ownerUserId = chosen === "none" ? null : chosen;
    const department = opt(fd, "department");
    const owner = ownerUserId ? opt(fd, "ownerName") : null;
    await assignIssue(getAppDb(), viewer.tenant, viewer.actor(), { issueId: str(fd, "issueId"), ownerUserId, ownerName: owner, department, note: opt(fd, "note") });
    return owner ? t("issue.toast.assignedTo", { name: owner }) : t("issue.toast.assigned", { department: label("user.department", department) });
  });
}

export async function resolveIssueAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    const issueId = str(fd, "issueId");
    await resolveIssue(getAppDb(), viewer.tenant, viewer.actor(), { issueId, note: str(fd, "note"), ticketRef: opt(fd, "ticketRef") });
    if (str(fd, "schedule") === "on") {
      const dueOn = opt(fd, "dueOn");
      const due = dueOn ? new Date(`${dueOn}T12:00:00`) : new Date(Date.now() + 2 * 86_400_000);
      const assignee = opt(fd, "assigneeUserId");
      await scheduleVerification(getAppDb(), viewer.tenant, viewer.actor(), { issueId, dueAt: due, assigneeUserId: assignee === "none" ? null : assignee, instructions: opt(fd, "instructions") });
      return `${t("issue.toast.resolved")} · ${t("verifications.toast.scheduled", { date: due.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) })}`;
    }
    return t("issue.toast.resolved");
  });
}

export async function recordOutcomeAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    const result = str(fd, "result") as OutcomeResult;
    const date = opt(fd, "observedAt");
    const { status } = await recordOutcome(getAppDb(), viewer.tenant, viewer.actor(), {
      issueId: str(fd, "issueId"),
      result,
      note: opt(fd, "note"),
      observedAt: date ? new Date(`${date}T12:00:00`) : null,
    });
    return status === "verified" ? t("issue.toast.verified") : t("issue.toast.cameBack");
  });
}

export async function changeIssueStatusAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    const status = str(fd, "status");
    await changeIssueStatus(getAppDb(), viewer.tenant, viewer.actor(), { issueId: str(fd, "issueId"), status, reason: opt(fd, "reason") });
    return t("issue.toast.status", { status: label("status", status) });
  });
}

export async function addIssueNoteAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    await addIssueNote(getAppDb(), viewer.tenant, viewer.actor(), { issueId: str(fd, "issueId"), text: str(fd, "text") });
    return t("issue.toast.noted");
  });
}

export async function editIssueAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    await editIssue(getAppDb(), viewer.tenant, viewer.actor(), {
      issueId: str(fd, "issueId"),
      title: opt(fd, "title"),
      category: opt(fd, "category"),
      severity: opt(fd, "severity"),
      department: opt(fd, "department"),
    });
    return t("issue.toast.edited");
  });
}
