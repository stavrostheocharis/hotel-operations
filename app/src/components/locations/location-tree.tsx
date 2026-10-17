"use client";

import { ChevronRightIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

export type TreeItem = {
  id: string;
  code: string;
  name: string;
  kind: string;
  aliases?: string[];
  open: number;
  openBelow: number;
  children: TreeItem[];
};

/**
 * Buildings › floors › rooms, then facilities, then equipment. The
 * selected branch is open; a search opens whatever matches by code, name
 * or alias. Counts are open issues, as muted numbers, only when > 0.
 */
export function LocationTree({ buildings, facilities, equipment, selectedCode }: { buildings: TreeItem[]; facilities: TreeItem[]; equipment: TreeItem[]; selectedCode: string | null }) {
  const [q, setQ] = useState("");
  const [opened, setOpened] = useState<Set<string>>(() => new Set(pathTo(buildings, selectedCode)));
  const needle = q.trim().toLowerCase();
  const matches = (n: TreeItem) => !needle || n.code.toLowerCase().includes(needle) || n.name.toLowerCase().includes(needle) || (n.aliases ?? []).some((a) => a.toLowerCase().includes(needle));
  const filtered = useMemo(() => (needle ? prune(buildings, matches) : buildings), [buildings, needle]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (code: string) =>
    setOpened((s) => {
      const n = new Set(s);
      if (n.has(code)) n.delete(code);
      else n.add(code);
      return n;
    });
  const isOpen = (code: string) => Boolean(needle) || opened.has(code);
  const any = filtered.length + facilities.filter(matches).length + equipment.filter(matches).length;

  return (
    <nav aria-label={t("locations.title")} className="flex flex-col gap-3">
      <InputGroup className="h-10 rounded-full">
        <InputGroupAddon>
          <SearchIcon className="size-4 text-muted-foreground" />
        </InputGroupAddon>
        <InputGroupInput value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("locations.search")} aria-label={t("locations.search")} />
      </InputGroup>
      {any === 0 ? <p className="px-2 text-caption text-muted-foreground">{t("locations.noMatch")}</p> : null}
      <Group label={t("locations.buildings")}>
        {filtered.map((b) => (
          <Node key={b.id} node={b} depth={0} selectedCode={selectedCode} isOpen={isOpen} toggle={toggle} />
        ))}
      </Group>
      <Group label={t("locations.facilities")}>
        {facilities.filter(matches).map((f) => (
          <Node key={f.id} node={f} depth={0} selectedCode={selectedCode} isOpen={isOpen} toggle={toggle} />
        ))}
      </Group>
      <Group label={t("locations.equipment")}>
        {equipment.filter(matches).map((e) => (
          <Node key={e.id} node={e} depth={0} selectedCode={selectedCode} isOpen={isOpen} toggle={toggle} />
        ))}
      </Group>
    </nav>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  const items = Array.isArray(children) ? children : [children];
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-1">
      <p className="px-2 text-caption-strong uppercase tracking-wide text-muted-foreground">{label}</p>
      <ul className="flex flex-col">{children}</ul>
    </div>
  );
}

function Node({ node, depth, selectedCode, isOpen, toggle }: { node: TreeItem; depth: number; selectedCode: string | null; isOpen: (code: string) => boolean; toggle: (code: string) => void }) {
  const selected = node.code === selectedCode;
  const open = isOpen(node.code);
  const count = node.children.length ? node.openBelow : node.open;
  return (
    <li>
      <div
        className={cn("flex items-center gap-1 rounded-sm pr-2 text-body transition-colors hover:bg-muted", selected && "bg-primary-soft text-primary")}
        style={{ paddingLeft: depth * 14 }}
      >
        {node.children.length ? (
          <button type="button" aria-label={open ? "collapse" : "expand"} aria-expanded={open} onClick={() => toggle(node.code)} className="flex size-7 items-center justify-center rounded-sm text-muted-foreground focus-visible:shadow-focus focus-visible:outline-none">
            <ChevronRightIcon className={cn("size-4 transition-transform", open && "rotate-90")} />
          </button>
        ) : (
          <span className="size-7" />
        )}
        <Link href={`/locations/${encodeURIComponent(node.code)}`} aria-current={selected ? "page" : undefined} className="flex min-w-0 flex-1 items-center gap-2 py-1.5 focus-visible:shadow-focus focus-visible:outline-none">
          <span className="truncate">{node.kind === "room" ? node.name : `${node.name}`}</span>
          <span className="text-caption text-muted-foreground">{node.code}</span>
          {count > 0 ? <span className="ml-auto text-caption text-muted-foreground tabular-nums">{count}</span> : null}
        </Link>
      </div>
      {node.children.length && open ? (
        <ul className="flex flex-col">
          {node.children.map((c) => (
            <Node key={c.id} node={c} depth={depth + 1} selectedCode={selectedCode} isOpen={isOpen} toggle={toggle} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function pathTo(nodes: TreeItem[], code: string | null): string[] {
  if (!code) return [];
  for (const n of nodes) {
    if (n.code === code) return [n.code];
    const inner = pathTo(n.children, code);
    if (inner.length) return [n.code, ...inner];
  }
  return [];
}

function prune(nodes: TreeItem[], keep: (n: TreeItem) => boolean): TreeItem[] {
  const out: TreeItem[] = [];
  for (const n of nodes) {
    const children = prune(n.children, keep);
    if (keep(n) || children.length) out.push({ ...n, children: keep(n) ? n.children : children });
  }
  return out;
}
