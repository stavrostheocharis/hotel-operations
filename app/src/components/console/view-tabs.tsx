import Link from "next/link";

import { t } from "@/i18n";
import { cn } from "@/lib/utils";

export type ViewTab = { key: string; label: string; count?: number; href: string };

/** Saved views as tabs bound to the URL: ink underline on the active one (DESIGN.md), counts in the label. */
export function ViewTabs({ tabs, active }: { tabs: ViewTab[]; active: string }) {
  return (
    <nav aria-label={t("app.views")} className="flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((tab) => {
        const on = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "-mb-px flex h-10 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-body transition-colors focus-visible:shadow-focus focus-visible:outline-none",
              on ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            {tab.count !== undefined ? <span className="text-caption text-muted-foreground tabular-nums">{tab.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
