import type { ReactNode } from "react";

import { AppShell } from "@/components/app/app-shell";

/** Every signed-in screen: the shell is static, the pages stream their own data. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
