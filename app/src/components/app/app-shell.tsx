import type { ReactNode } from "react";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { t } from "@/i18n";
import { AppSidebar } from "./app-sidebar";
import { NAV } from "./nav";
import { TopBar } from "./top-bar";

/**
 * The frame every signed-in screen sits in: sidebar, top bar, a centred main
 * column, toasts. Synchronous on purpose: nothing here reads the request, so
 * the frame is prerendered and only the islands inside the sidebar wait on
 * the session.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const byKey: Record<string, string> = {};
  const jumps: { key: string; href: string; label: string }[] = [];
  for (const g of NAV) {
    for (const i of g.items) {
      byKey[i.key] = t(`nav.${i.key}`);
      if (!i.soon) jumps.push({ key: i.key, href: i.href, label: t(`nav.${i.key}`) });
    }
  }
  return (
    <SidebarProvider>
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-background focus:px-4 focus:py-2 focus:shadow-focus">
        {t("app.skipToContent")}
      </a>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <TopBar
          labels={{ search: t("app.search"), searchHint: t("app.searchHint"), noResults: t("common.none"), sections: t("nav.work"), byKey }}
          jumps={jumps}
        />
        <main id="content" className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
          {children}
        </main>
      </SidebarInset>
      <Toaster position="bottom-right" />
    </SidebarProvider>
  );
}
