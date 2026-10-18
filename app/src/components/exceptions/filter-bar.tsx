"use client";

import { SearchIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { t } from "@/i18n";

export type FilterOption = { value: string; label: string };

/**
 * The queue's toolbar. Everything lives in the URL (`?q=&department=…`), so
 * a filtered view can be shared and the back button works.
 */
export function FilterBar({ departments, categories, sorts }: { departments: FilterOption[]; categories: FilterOption[]; sorts: FilterOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`);
  };
  const active = ["q", "department", "category", "critical"].some((k) => params.get(k));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <form
          className="min-w-64 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            set("q", q.trim() || null);
          }}
        >
          <InputGroup className="h-10 rounded-full">
            <InputGroupAddon>
              <SearchIcon className="size-4 text-muted-foreground" />
            </InputGroupAddon>
            <InputGroupInput value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("exceptions.toolbar.search")} aria-label={t("exceptions.toolbar.search")} />
          </InputGroup>
        </form>
        <Picker id="department" label={t("exceptions.toolbar.department")} value={params.get("department") ?? ""} options={departments} onChange={(v) => set("department", v)} />
        <Picker id="category" label={t("exceptions.toolbar.category")} value={params.get("category") ?? ""} options={categories} onChange={(v) => set("category", v)} />
        <Picker id="sort" label={t("exceptions.toolbar.sort")} value={params.get("sort") ?? sorts[0]?.value ?? ""} options={sorts} onChange={(v) => set("sort", v)} noAny />
        <label className="flex h-10 items-center gap-2 rounded-full bg-secondary px-4 text-body text-foreground">
          <Switch checked={params.get("critical") === "1"} onCheckedChange={(v) => set("critical", v ? "1" : null)} />
          {t("exceptions.toolbar.critical")}
        </label>
        {active ? (
          <Button variant="ghost" render={<Link href={params.get("view") ? `${pathname}?view=${params.get("view")}` : pathname} />}>
            <XIcon /> {t("exceptions.toolbar.clear")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function Picker({ id, label, value, options, onChange, noAny }: { id: string; label: string; value: string; options: FilterOption[]; onChange: (v: string | null) => void; noAny?: boolean }) {
  const items = noAny ? options : [{ value: "", label: `${label}: ${t("exceptions.toolbar.any")}` }, ...options.map((o) => ({ value: o.value, label: `${label}: ${o.label}` }))];
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
