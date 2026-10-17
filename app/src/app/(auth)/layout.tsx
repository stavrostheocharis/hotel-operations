import type { ReactNode } from "react";

/** Sign-in and its siblings: no sidebar, one centred card. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <div className="flex min-h-svh flex-1 items-center justify-center bg-background px-4 py-12">{children}</div>;
}
