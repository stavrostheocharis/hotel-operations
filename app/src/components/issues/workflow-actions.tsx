"use client";

import { ChevronDownIcon } from "lucide-react";
import { useActionState, useCallback, useState } from "react";
import { toast } from "sonner";

import { useActionToast } from "@/components/console/use-action-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  assignIssueAction,
  changeIssueStatusAction,
  editIssueAction,
  recordOutcomeAction,
  resolveIssueAction,
  type ActionResult,
} from "@/console/issue-actions";
import type { AssignableUser } from "@/console/issue-detail";
import { label, t } from "@/i18n";

export type Option = { value: string; label: string };

export type WorkflowIssue = {
  id: string;
  title: string;
  status: string;
  category: string | null;
  severity: string;
  department: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
};

export type WorkflowPermissions = { assign: boolean; status: boolean; verify: boolean; edit: boolean; close: boolean };

type DialogKind = "assign" | "resolve" | "verify" | "status" | "edit" | null;

/**
 * One primary action per status, the rest under "More". Every dialog posts
 * to a server action and ends in one toast.
 */
export function WorkflowActions({
  issue,
  users,
  departments,
  categories,
  severities,
  statuses,
  can,
}: {
  issue: WorkflowIssue;
  users: AssignableUser[];
  departments: Option[];
  categories: Option[];
  severities: Option[];
  statuses: Option[];
  can: WorkflowPermissions;
}) {
  const [open, setOpen] = useState<DialogKind>(null);
  const close = useCallback(() => setOpen(null), []);

  const primary: { kind: DialogKind; text: string } | null =
    (issue.status === "detected" || issue.status === "reopened") && can.assign
      ? { kind: "assign", text: t("issue.actions.assign") }
      : issue.status === "assigned" && can.status
        ? { kind: "resolve", text: t("issue.actions.resolve") }
        : (issue.status === "resolved" || issue.status === "closed_unverified") && can.verify
          ? { kind: "verify", text: t("issue.actions.verify") }
          : null;

  const more: { kind: DialogKind | "copy"; text: string; show: boolean }[] = [
    { kind: "assign", text: t("issue.actions.changeOwner"), show: can.assign && primary?.kind !== "assign" },
    { kind: "status", text: t("issue.actions.changeStatus"), show: can.status },
    { kind: "verify", text: t("issue.actions.verify"), show: can.verify && primary?.kind !== "verify" },
    { kind: "edit", text: t("issue.actions.edit"), show: can.edit },
    { kind: "copy", text: t("issue.actions.copyLink"), show: true },
  ];

  const copy = async () => {
    await navigator.clipboard.writeText(window.location.href);
    toast.success(t("issue.actions.copied"));
  };

  return (
    <>
      {primary ? <Button onClick={() => setOpen(primary.kind)}>{primary.text}</Button> : null}
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="secondary" />}>
          {t("issue.actions.more")}
          <ChevronDownIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            {more
              .filter((m) => m.show && m.kind !== "copy")
              .map((m) => (
                <DropdownMenuItem key={m.kind} onClick={() => setOpen(m.kind as DialogKind)}>
                  {m.text}
                </DropdownMenuItem>
              ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={copy}>{t("issue.actions.copyLink")}</DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <AssignDialog open={open === "assign"} onClose={close} issue={issue} users={users} departments={departments} />
      <ResolveDialog open={open === "resolve"} onClose={close} issue={issue} />
      <VerifyDialog open={open === "verify"} onClose={close} issue={issue} />
      <StatusDialog open={open === "status"} onClose={close} issue={issue} statuses={statuses.filter((s) => s.value !== "closed_unverified" || can.close)} />
      <EditDialog open={open === "edit"} onClose={close} issue={issue} categories={categories} severities={severities} departments={departments} />
    </>
  );
}

function Frame({ open, onClose, title, description, children }: { open: boolean; onClose: () => void; title: string; description: string; children: React.ReactNode }) {
  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function Footer({ pending, submit }: { pending: boolean; submit: string }) {
  return (
    <DialogFooter>
      <DialogClose render={<Button variant="ghost" type="button" />}>{t("issue.dialog.cancel")}</DialogClose>
      <Button type="submit" disabled={pending}>
        {pending ? t("issue.dialog.saving") : submit}
      </Button>
    </DialogFooter>
  );
}

function Field({ id, text, hint, children }: { id: string; text: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>
        {text}
        {hint ? <span className="ml-1 text-caption font-normal text-muted-foreground">({hint})</span> : null}
      </Label>
      {children}
    </div>
  );
}

function AssignDialog({ open, onClose, issue, users, departments }: { open: boolean; onClose: () => void; issue: WorkflowIssue; users: AssignableUser[]; departments: Option[] }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(assignIssueAction, null);
  const [department, setDepartment] = useState<string>(issue.department ?? "");
  const [owner, setOwner] = useState<string>(issue.ownerUserId ?? "none");
  useActionToast(state, onClose);
  const candidates = users.filter((u) => !department || !u.department || u.department === department || u.role === "gm" || u.role === "group_admin");
  const ownerName = users.find((u) => u.id === owner)?.name ?? "";
  return (
    <Frame open={open} onClose={onClose} title={t("issue.dialog.assignTitle")} description={t("issue.dialog.assignDescription")}>
      <form action={action} className="flex flex-col gap-5">
        <input type="hidden" name="issueId" value={issue.id} />
        <input type="hidden" name="ownerName" value={ownerName} />
        <Field id="department" text={t("issue.dialog.department")}>
          <Select name="department" value={department} onValueChange={(v) => setDepartment(String(v ?? ""))} items={[{ value: "", label: t("issue.dialog.noDepartment") }, ...departments]}>
            <SelectTrigger id="department" className="h-10 w-full rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{t("issue.dialog.noDepartment")}</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field id="owner" text={t("issue.dialog.owner")}>
          <Select name="ownerUserId" value={owner} onValueChange={(v) => setOwner(String(v ?? "none"))} items={[{ value: "none", label: t("issue.dialog.noOwner") }, ...candidates.map((u) => ({ value: u.id, label: u.name }))]}>
            <SelectTrigger id="owner" className="h-10 w-full rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("issue.dialog.noOwner")}</SelectItem>
              {candidates.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name} · {label("user.role", u.role)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field id="assign-note" text={t("issue.dialog.note")} hint={t("issue.dialog.optional")}>
          <Textarea id="assign-note" name="note" rows={3} />
        </Field>
        <Footer pending={pending} submit={t("issue.actions.assign")} />
      </form>
    </Frame>
  );
}

function ResolveDialog({ open, onClose, issue }: { open: boolean; onClose: () => void; issue: WorkflowIssue }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(resolveIssueAction, null);
  useActionToast(state, onClose);
  return (
    <Frame open={open} onClose={onClose} title={t("issue.dialog.resolveTitle")} description={t("issue.dialog.resolveDescription")}>
      <form action={action} className="flex flex-col gap-5">
        <input type="hidden" name="issueId" value={issue.id} />
        <Field id="resolution" text={t("issue.dialog.resolutionNote")}>
          <Textarea id="resolution" name="note" rows={4} required />
        </Field>
        <Field id="ticketRef" text={t("issue.dialog.ticketRef")} hint={t("issue.dialog.optional")}>
          <Input id="ticketRef" name="ticketRef" />
        </Field>
        <Footer pending={pending} submit={t("issue.actions.resolve")} />
      </form>
    </Frame>
  );
}

function VerifyDialog({ open, onClose, issue }: { open: boolean; onClose: () => void; issue: WorkflowIssue }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(recordOutcomeAction, null);
  useActionToast(state, onClose);
  const today = new Date().toISOString().slice(0, 10);
  const options: Option[] = [
    { value: "staff_evidence", label: t("issue.dialog.resultHeld") },
    { value: "guest_confirmed", label: t("issue.dialog.resultGuest") },
    { value: "recurred", label: t("issue.dialog.resultBack") },
  ];
  return (
    <Frame open={open} onClose={onClose} title={t("issue.dialog.verifyTitle")} description={t("issue.dialog.verifyDescription")}>
      <form action={action} className="flex flex-col gap-5">
        <input type="hidden" name="issueId" value={issue.id} />
        <RadioGroup name="result" defaultValue="staff_evidence" className="gap-3">
          {options.map((o) => (
            <label key={o.value} className="flex items-center gap-3 text-body text-foreground">
              <RadioGroupItem value={o.value} />
              {o.label}
            </label>
          ))}
        </RadioGroup>
        <Field id="observedAt" text={t("issue.dialog.checkedOn")}>
          <Input id="observedAt" name="observedAt" type="date" defaultValue={today} max={today} />
        </Field>
        <Field id="verify-note" text={t("issue.dialog.note")} hint={t("issue.dialog.optional")}>
          <Textarea id="verify-note" name="note" rows={3} />
        </Field>
        <Footer pending={pending} submit={t("issue.actions.verify")} />
      </form>
    </Frame>
  );
}

function StatusDialog({ open, onClose, issue, statuses }: { open: boolean; onClose: () => void; issue: WorkflowIssue; statuses: Option[] }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(changeIssueStatusAction, null);
  const [status, setStatus] = useState(issue.status);
  useActionToast(state, onClose);
  return (
    <Frame open={open} onClose={onClose} title={t("issue.dialog.statusTitle")} description={t("issue.dialog.statusDescription")}>
      <form action={action} className="flex flex-col gap-5">
        <input type="hidden" name="issueId" value={issue.id} />
        <Field id="status" text={t("issue.dialog.status")}>
          <Select name="status" value={status} onValueChange={(v) => setStatus(String(v))} items={statuses}>
            <SelectTrigger id="status" className="h-10 w-full rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statuses.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field id="reason" text={t("issue.dialog.reason")} hint={t("issue.dialog.optional")}>
          <Textarea id="reason" name="reason" rows={3} />
        </Field>
        <Footer pending={pending} submit={t("issue.dialog.save")} />
      </form>
    </Frame>
  );
}

function EditDialog({
  open,
  onClose,
  issue,
  categories,
  severities,
  departments,
}: {
  open: boolean;
  onClose: () => void;
  issue: WorkflowIssue;
  categories: Option[];
  severities: Option[];
  departments: Option[];
}) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(editIssueAction, null);
  const [category, setCategory] = useState(issue.category ?? "");
  const [severity, setSeverity] = useState(issue.severity);
  const [department, setDepartment] = useState(issue.department ?? "");
  useActionToast(state, onClose);
  const select = (id: string, name: string, value: string, set: (v: string) => void, items: Option[], empty?: string) => (
    <Select name={name} value={value} onValueChange={(v) => set(String(v ?? ""))} items={empty ? [{ value: "", label: empty }, ...items] : items}>
      <SelectTrigger id={id} className="h-10 w-full rounded-lg">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {empty ? <SelectItem value="">{empty}</SelectItem> : null}
        {items.map((i) => (
          <SelectItem key={i.value} value={i.value}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  return (
    <Frame open={open} onClose={onClose} title={t("issue.dialog.editTitle")} description="">
      <form action={action} className="flex flex-col gap-5">
        <input type="hidden" name="issueId" value={issue.id} />
        <Field id="title" text={t("issue.dialog.title")}>
          <Input id="title" name="title" defaultValue={issue.title} required />
        </Field>
        <Field id="category" text={t("issue.dialog.category")}>
          {select("category", "category", category, setCategory, categories, t("common.none"))}
        </Field>
        <Field id="severity" text={t("issue.dialog.severity")}>
          {select("severity", "severity", severity, setSeverity, severities)}
        </Field>
        <Field id="edit-department" text={t("issue.dialog.department")}>
          {select("edit-department", "department", department, setDepartment, departments, t("issue.dialog.noDepartment"))}
        </Field>
        <Footer pending={pending} submit={t("issue.dialog.save")} />
      </form>
    </Frame>
  );
}
