import Link from "next/link";
import type { ReactNode } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const NAV: { href: string; label: string; key: string }[] = [
  { href: "/", label: "Exceptions", key: "exceptions" },
  { href: "/design", label: "Design", key: "design" },
];

/**
 * The console frame: a quiet header with the property and the primary
 * navigation (active item in blue, per DESIGN.md), then the page.
 */
export function ConsoleShell({ active, property, children }: { active: string; property?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-6">
          <Link href="/" className="text-body-strong text-foreground">
            Operations Exception Manager
          </Link>
          {property ? <span className="text-caption text-muted-foreground">{property}</span> : null}
          <nav className="ml-auto flex items-center gap-1">
            {NAV.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                aria-current={item.key === active ? "page" : undefined}
                className={cn(
                  "rounded-sm px-3 py-2 text-body-strong transition-colors hover:bg-muted focus-visible:shadow-focus focus-visible:outline-none",
                  item.key === active ? "bg-primary-soft text-primary" : "text-muted-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
            <ThemeToggle />
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
