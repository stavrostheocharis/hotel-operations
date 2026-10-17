"use client";

import { SearchIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from "@/components/ui/breadcrumb";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { navKeyForPath } from "./nav";

export type TopBarLabels = {
  search: string;
  searchHint: string;
  noResults: string;
  sections: string;
  byKey: Record<string, string>;
};

/**
 * The strip above the page: sidebar toggle, where you are, and the ⌘K jump
 * list. Everything here comes from the URL or static labels, so it is part
 * of the static shell.
 */
export function TopBar({ labels, jumps }: { labels: TopBarLabels; jumps: { key: string; href: string; label: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-4 print:hidden">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-5" />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            {/* The URL is request data on dynamic routes, so the crumb streams in. */}
            <Suspense fallback={<BreadcrumbPage>&nbsp;</BreadcrumbPage>}>
              <CurrentSection byKey={labels.byKey} />
            </Suspense>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ml-auto inline-flex h-10 items-center gap-2 rounded-full bg-secondary px-4 text-body text-muted-foreground transition-colors hover:bg-surface-hover focus-visible:shadow-focus focus-visible:outline-none"
      >
        <SearchIcon className="size-4" />
        <span className="hidden sm:inline">{labels.search}</span>
        <kbd className="hidden rounded-sm bg-background px-1.5 text-caption text-muted-foreground sm:inline">{labels.searchHint}</kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen} title={labels.search} description={labels.sections}>
        <Command>
          <CommandInput placeholder={labels.search} />
          <CommandList>
            <CommandEmpty>{labels.noResults}</CommandEmpty>
            <CommandGroup heading={labels.sections}>
              {jumps.map((j) => (
                <CommandItem
                  key={j.key}
                  value={j.label}
                  onSelect={() => {
                    setOpen(false);
                    router.push(j.href);
                  }}
                >
                  {j.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </header>
  );
}

function CurrentSection({ byKey }: { byKey: Record<string, string> }) {
  const pathname = usePathname();
  const section = navKeyForPath(pathname);
  return <BreadcrumbPage>{section ? byKey[section] : ""}</BreadcrumbPage>;
}
