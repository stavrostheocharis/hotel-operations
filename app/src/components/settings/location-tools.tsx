"use client";

import { PlusIcon, XIcon } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";

import { useActionToast } from "@/components/console/use-action-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ActionResult } from "@/console/issue-actions";
import { addAliasAction, createLocationAction, mapSpellingAction, removeAliasAction, setServesAction } from "@/console/location-actions";
import { label, t } from "@/i18n";

export type PlaceOption = { id: string; code: string; name: string; kind: string };

function report(res: ActionResult) {
  if (res.ok) toast.success(res.message);
  else toast.error(res.message, { duration: Infinity, closeButton: true });
}

/** The aliases of one place as chips, with add and remove. */
export function AliasEditor({ locationId, aliases }: { locationId: string; aliases: string[] }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(addAliasAction, null);
  const [removeState, removeAction, removing] = useActionState<ActionResult | null, FormData>(removeAliasAction, null);
  const [open, setOpen] = useState(false);
  useActionToast(state, () => setOpen(false));
  useActionToast(removeState);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {aliases.map((a) => (
        <form key={a} action={removeAction} className="inline-flex items-center gap-1 rounded-full bg-secondary py-1 pr-1 pl-2.5 text-caption text-foreground">
          <input type="hidden" name="locationId" value={locationId} />
          <input type="hidden" name="alias" value={a} />
          <span>{a}</span>
          <button type="submit" aria-label={`${t("settings.locations.removeAlias")} ${a}`} disabled={removing} className="flex size-5 items-center justify-center rounded-full hover:bg-surface-hover focus-visible:shadow-focus focus-visible:outline-none">
            <XIcon className="size-3" />
          </button>
        </form>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={<Button variant="ghost" size="icon" aria-label={t("settings.locations.addAlias")} />}>
          <PlusIcon />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72">
          <form action={action} className="flex flex-col gap-3">
            <input type="hidden" name="locationId" value={locationId} />
            <Label htmlFor={`alias-${locationId}`}>{t("settings.locations.alias")}</Label>
            <Input id={`alias-${locationId}`} name="alias" required autoFocus />
            <Button type="submit" disabled={pending}>
              {t("settings.locations.addAlias")}
            </Button>
          </form>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** For equipment: tick every place it serves. */
export function ServesDialog({ equipmentId, equipmentName, places, current }: { equipmentId: string; equipmentName: string; places: PlaceOption[]; current: string[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(setServesAction, null);
  const [q, setQ] = useState("");
  useActionToast(state, () => setOpen(false));
  const needle = q.trim().toLowerCase();
  const shown = places.filter((p) => p.kind !== "equipment" && p.kind !== "property" && (!needle || p.code.toLowerCase().includes(needle) || p.name.toLowerCase().includes(needle)));
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        {t("settings.locations.setServes")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{equipmentName}</DialogTitle>
            <DialogDescription>{t("settings.locations.servesHint")}</DialogDescription>
          </DialogHeader>
          <form action={action} className="flex flex-col gap-4">
            <input type="hidden" name="equipmentId" value={equipmentId} />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("locations.search")} />
            <ScrollArea className="h-72 rounded-lg bg-secondary p-2">
              <ul className="flex flex-col">
                {shown.map((p) => (
                  <li key={p.id}>
                    <label className="flex items-center gap-3 rounded-sm px-2 py-1.5 text-body text-foreground hover:bg-surface-hover">
                      <Checkbox name="servesId" value={p.id} defaultChecked={current.includes(p.id)} />
                      <span className="flex-1 truncate">{p.name}</span>
                      <span className="text-caption text-muted-foreground">
                        {p.code} · {label("locations.kind", p.kind)}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </ScrollArea>
            <DialogFooter>
              <DialogClose render={<Button variant="ghost" type="button" />}>{t("issue.dialog.cancel")}</DialogClose>
              <Button type="submit" disabled={pending}>
                {t("issue.dialog.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** "Map to…": pick the place a typed spelling means; the records move at once. */
export function MapSpelling({ spelling, places }: { spelling: string; places: PlaceOption[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const choose = (id: string) => {
    setOpen(false);
    const fd = new FormData();
    fd.set("spelling", spelling);
    fd.set("locationId", id);
    start(async () => report(await mapSpellingAction(null, fd)));
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="secondary" disabled={pending} />}>{t("settings.locations.mapTo")}</PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <Command>
          <CommandInput placeholder={t("settings.locations.pickPlace")} />
          <CommandList>
            <CommandEmpty>{t("common.none")}</CommandEmpty>
            <CommandGroup>
              {places.map((p) => (
                <CommandItem key={p.id} value={`${p.code} ${p.name} ${p.kind}`} onSelect={() => choose(p.id)}>
                  <span className="flex-1 truncate">
                    {p.name} <span className="text-caption text-muted-foreground">· {p.code} · {p.kind}</span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** A new room, facility or piece of equipment. */
export function AddLocationDialog({ parents }: { parents: PlaceOption[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(createLocationAction, null);
  const [kind, setKind] = useState("room");
  const [parent, setParent] = useState("");
  useActionToast(state, () => setOpen(false));
  const kinds = ["building", "floor", "room", "facility", "equipment"].map((k) => ({ value: k, label: label("locations.kind", k) }));
  const parentOptions = parents.filter((p) => (kind === "room" ? p.kind === "floor" || p.kind === "building" : kind === "floor" ? p.kind === "building" : p.kind === "property" || p.kind === "building"));
  return (
    <>
      <Button onClick={() => setOpen(true)}>{t("settings.locations.addLocation")}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("settings.locations.addLocation")}</DialogTitle>
            <DialogDescription>{t("settings.locations.addDescription")}</DialogDescription>
          </DialogHeader>
          <form action={action} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-kind">{t("settings.locations.kinds")}</Label>
              <Select name="kind" value={kind} onValueChange={(v) => setKind(String(v))} items={kinds}>
                <SelectTrigger id="new-kind" className="h-10 w-full rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {kinds.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="new-code">{t("settings.locations.code")}</Label>
                <Input id="new-code" name="code" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="new-name">{t("settings.locations.name")}</Label>
                <Input id="new-name" name="name" required />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-parent">{t("settings.locations.parent")}</Label>
              <Select name="parentId" value={parent} onValueChange={(v) => setParent(String(v ?? ""))} items={[{ value: "", label: t("common.none") }, ...parentOptions.map((p) => ({ value: p.id, label: `${p.name} (${p.code})` }))]}>
                <SelectTrigger id="new-parent" className="h-10 w-full rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{t("common.none")}</SelectItem>
                  {parentOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="ghost" type="button" />}>{t("issue.dialog.cancel")}</DialogClose>
              <Button type="submit" disabled={pending}>
                {t("settings.locations.addLocation")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
