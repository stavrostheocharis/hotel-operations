"use client";

import { CheckIcon, SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { useActionToast } from "@/components/console/use-action-toast";
import { AssigneeSelect, type Option } from "@/components/issues/workflow-actions";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ActionResult } from "@/console/issue-actions";
import type { AssignableUser } from "@/console/issue-detail";
import { createIssueFromSignalAction, linkSignalToIssueAction, reclassifySignalAction, relocateSignalAction, searchIssuesAction } from "@/console/signal-actions";
import type { IssueMatch, PlaceOption } from "@/console/signals";
import { label, t } from "@/i18n";

function report(res: ActionResult) {
  if (res.ok) toast.success(res.message);
  else toast.error(res.message, { duration: Infinity, closeButton: true });
}

/** "Change" → a searchable list of every place; picking one saves at once. */
export function PlacePicker({ signalId, places, currentId }: { signalId: string; places: PlaceOption[]; currentId: string | null }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const choose = (id: string | null) => {
    setOpen(false);
    const fd = new FormData();
    fd.set("signalId", signalId);
    if (id) fd.set("locationId", id);
    start(async () => report(await relocateSignalAction(null, fd)));
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="ghost" disabled={pending} />}>{t("signals.record.change")}</PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <Command>
          <CommandInput placeholder={t("signals.record.pick")} />
          <CommandList>
            <CommandEmpty>{t("common.none")}</CommandEmpty>
            <CommandGroup>
              <CommandItem value="__none" onSelect={() => choose(null)}>
                {t("signals.record.noPlace")}
              </CommandItem>
              {places.map((p) => (
                <CommandItem key={p.id} value={`${p.code} ${p.name} ${p.kind}`} onSelect={() => choose(p.id)}>
                  <span className="flex-1 truncate">
                    {p.name} <span className="text-caption text-muted-foreground">· {p.code} · {p.kind}</span>
                  </span>
                  {p.id === currentId ? <CheckIcon className="size-4" /> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Category and topic, saved together. Topics follow the category. */
export function ClassificationForm({ signalId, category, topic, categories, topics }: { signalId: string; category: string | null; topic: string | null; categories: Option[]; topics: { value: string; label: string; category: string }[] }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(reclassifySignalAction, null);
  const [cat, setCat] = useState(category ?? "");
  const [top, setTop] = useState(topic ?? "");
  useActionToast(state);
  const options = topics.filter((x) => !cat || x.category === cat);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="signalId" value={signalId} />
      <div className="flex flex-col gap-1">
        <Label htmlFor={`cat-${signalId}`} className="text-caption text-muted-foreground">
          {t("signals.record.pickCategory")}
        </Label>
        <Select
          name="category"
          value={cat}
          onValueChange={(v) => {
            const next = String(v ?? "");
            setCat(next);
            if (top && !topics.some((x) => x.value === top && x.category === next)) setTop("");
          }}
          items={[{ value: "", label: t("common.none") }, ...categories]}
        >
          <SelectTrigger id={`cat-${signalId}`} className="h-10 w-44 rounded-lg">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t("common.none")}</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`top-${signalId}`} className="text-caption text-muted-foreground">
          {t("signals.record.pickTopic")}
        </Label>
        <Select name="topic" value={top} onValueChange={(v) => setTop(String(v ?? ""))} items={[{ value: "", label: t("common.none") }, ...options]}>
          <SelectTrigger id={`top-${signalId}`} className="h-10 w-48 rounded-lg">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t("common.none")}</SelectItem>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" variant="secondary" disabled={pending || (cat === (category ?? "") && top === (topic ?? ""))}>
        {t("issue.dialog.save")}
      </Button>
    </form>
  );
}

/** One "Link" button per suggested issue. */
export function LinkButton({ signalId, issueId }: { signalId: string; issueId: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(linkSignalToIssueAction, null);
  useActionToast(state);
  return (
    <form action={action}>
      <input type="hidden" name="signalId" value={signalId} />
      <input type="hidden" name="issueId" value={issueId} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {t("signals.record.link")}
      </Button>
    </form>
  );
}

/** Search any issue by title or place and link the record to it. */
export function LinkSearch({ signalId }: { signalId: string }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<IssueMatch[]>([]);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChange = (value: string) => {
    setQ(value);
    if (timer.current) clearTimeout(timer.current);
    if (!value.trim()) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(() => start(async () => setResults(await searchIssuesAction(value))), 250);
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => onChange(e.target.value)} placeholder={t("signals.record.searchIssues")} className="pl-9" />
      </div>
      {results.length ? (
        <ul className="flex flex-col divide-y divide-border rounded-lg bg-secondary">
          {results.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0 truncate text-body text-foreground">
                {r.title} <span className="text-caption text-muted-foreground">· {label("status", r.status)}</span>
              </span>
              <LinkButton signalId={signalId} issueId={r.id} />
            </li>
          ))}
        </ul>
      ) : pending ? (
        <p className="text-caption text-muted-foreground">{t("app.loading")}</p>
      ) : null}
    </div>
  );
}

/** Start an issue from this record. The action redirects to the new issue. */
export function CreateIssueDialog({
  signalId,
  defaultTitle,
  category,
  categories,
  severities,
  departments,
  users,
}: {
  signalId: string;
  defaultTitle: string;
  category: string | null;
  categories: Option[];
  severities: Option[];
  departments: Option[];
  users: AssignableUser[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(createIssueFromSignalAction, null);
  const [cat, setCat] = useState(category ?? "");
  const [sev, setSev] = useState("medium");
  const [dept, setDept] = useState("");
  const [owner, setOwner] = useState("none");
  const router = useRouter();
  useActionToast(state, () => {
    setOpen(false);
    router.refresh();
  });
  const ownerName = users.find((u) => u.id === owner)?.name ?? "";
  const pick = (id: string, name: string, value: string, set: (v: string) => void, items: Option[], empty?: string) => (
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
    <>
      <Button onClick={() => setOpen(true)}>{t("signals.record.create")}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("signals.create.title")}</DialogTitle>
            <DialogDescription>{t("signals.create.description")}</DialogDescription>
          </DialogHeader>
          <form action={action} className="flex flex-col gap-5">
            <input type="hidden" name="signalId" value={signalId} />
            <input type="hidden" name="ownerName" value={ownerName} />
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-title">{t("signals.create.issueTitle")}</Label>
              <Input id="new-title" name="title" defaultValue={defaultTitle} required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="new-cat">{t("issue.dialog.category")}</Label>
                {pick("new-cat", "category", cat, setCat, categories, t("common.none"))}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="new-sev">{t("issue.dialog.severity")}</Label>
                {pick("new-sev", "severity", sev, setSev, severities)}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="new-dept">{t("issue.dialog.department")}</Label>
                {pick("new-dept", "department", dept, setDept, departments, t("issue.dialog.noDepartment"))}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="new-owner">{t("issue.dialog.owner")}</Label>
                <AssigneeSelect id="new-owner" value={owner} onChange={setOwner} users={users} />
              </div>
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="ghost" type="button" />}>{t("issue.dialog.cancel")}</DialogClose>
              <Button type="submit" disabled={pending}>
                {pending ? t("issue.dialog.saving") : t("signals.create.submit")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
