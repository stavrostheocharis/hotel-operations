"use client";

import { ChevronDownIcon, ChevronUpIcon, ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { t } from "@/i18n";

/**
 * The record, in a side sheet over the list. Open state is the URL
 * (`?record=<id>`), so reload and back work; ↑/↓ walk the list.
 */
export function RecordDrawer({
  listHref,
  prevHref,
  nextHref,
  pageHref,
  title,
  description,
  children,
}: {
  listHref: string;
  prevHref: string | null;
  nextHref: string | null;
  pageHref: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest("input, textarea, [contenteditable]")) return;
      if (e.key === "ArrowUp" && prevHref) router.push(prevHref);
      if (e.key === "ArrowDown" && nextHref) router.push(nextHref);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prevHref, nextHref, router]);
  return (
    <Sheet open onOpenChange={(o) => (!o ? router.push(listHref) : null)}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl">
        <SheetHeader className="flex-row items-start justify-between gap-3 border-b border-border px-6 py-4">
          <div className="flex min-w-0 flex-col gap-1">
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </div>
          <div className="flex shrink-0 items-center gap-1 pr-8">
            <Button variant="ghost" size="icon" aria-label={t("signals.record.prev")} disabled={!prevHref} render={prevHref ? <Link href={prevHref} /> : undefined}>
              <ChevronUpIcon />
            </Button>
            <Button variant="ghost" size="icon" aria-label={t("signals.record.next")} disabled={!nextHref} render={nextHref ? <Link href={nextHref} /> : undefined}>
              <ChevronDownIcon />
            </Button>
            <Button variant="ghost" size="icon" aria-label={t("signals.record.openPage")} render={<Link href={pageHref} />}>
              <ExternalLinkIcon />
            </Button>
          </div>
        </SheetHeader>
        <div className="flex flex-col gap-6 px-6 py-5">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
