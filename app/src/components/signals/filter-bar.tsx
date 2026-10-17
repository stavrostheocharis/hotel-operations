"use client";

import { SearchIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { t } from "@/i18n";

export type FilterOption = { value: string; label: string };

/** The inbox toolbar; every filter lives in the URL. */
export function SignalsFilterBar({ sources, categories }: { sources: FilterOption[]; categories: FilterOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const set = (pairs: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(pairs)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    next.delete("record");
    router.push(`${pathname}?${next.toString()}`);
  };
  const active = ["q", "source", "category", "from", "to", "nonEnglish"].some((k) => params.get(k));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        className="min-w-64 flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          set({ q: q.trim() || null });
        }}
      >
        <InputGroup className="h-10 rounded-full">
          <InputGroupAddon>
            <SearchIcon className="size-4 text-muted-foreground" />
          </InputGroupAddon>
          <InputGroupInput value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("signals.toolbar.search")} aria-label={t("signals.toolbar.search")} />
        </InputGroup>
      </form>
      <Picker id="source" label={t("signals.toolbar.source")} value={params.get("source") ?? ""} options={sources} onChange={(v) => set({ source: v })} />
      <Picker id="category" label={t("signals.toolbar.category")} value={params.get("category") ?? ""} options={categories} onChange={(v) => set({ category: v })} />
      <Input type="date" aria-label={t("signals.toolbar.from")} defaultValue={params.get("from") ?? ""} onChange={(e) => set({ from: e.target.value || null })} className="h-10 w-40 rounded-full border-0 bg-secondary" />
      <Input type="date" aria-label={t("signals.toolbar.to")} defaultValue={params.get("to") ?? ""} onChange={(e) => set({ to: e.target.value || null })} className="h-10 w-40 rounded-full border-0 bg-secondary" />
      <label className="flex h-10 items-center gap-2 rounded-full bg-secondary px-4 text-body text-foreground">
        <Switch checked={params.get("nonEnglish") === "1"} onCheckedChange={(v) => set({ nonEnglish: v ? "1" : null })} />
        {t("signals.toolbar.nonEnglish")}
      </label>
      {active ? (
        <Button variant="ghost" render={<Link href={pathname} />}>
          <XIcon /> {t("signals.toolbar.clear")}
        </Button>
      ) : null}
    </div>
  );
}

function Picker({ id, label, value, options, onChange }: { id: string; label: string; value: string; options: FilterOption[]; onChange: (v: string | null) => void }) {
  const items = [{ value: "", label: `${label}: ${t("signals.toolbar.any")}` }, ...options.map((o) => ({ value: o.value, label: `${label}: ${o.label}` }))];
  return (
    <Select value={value} onValueChange={(v) => onChange(v ? String(v) : null)} items={items}>
      <SelectTrigger id={id} aria-label={label} className="h-10 rounded-full border-0 bg-secondary px-4">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((o) => (
          <SelectItem key={o.value || "any"} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
