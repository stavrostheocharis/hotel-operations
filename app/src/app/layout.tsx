import type { Metadata } from "next";
import { DM_Sans, Noto_Sans } from "next/font/google";

import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

// DM Sans is the UI typeface (DESIGN.md → Typography). next/font self-hosts it
// under its real family name, so globals.css can name "DM Sans" directly; the
// `variable` is exposed for completeness but the theme does not depend on it
// (its value would put an Arial fallback ahead of Noto Sans for Greek text).
const dmSans = DM_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-dm-sans",
  display: "swap",
});

// Noto Sans supplies the Greek glyphs for staff-facing UI text.
const notoSans = Noto_Sans({
  subsets: ["greek", "greek-ext"],
  variable: "--font-noto-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Operations Exception Manager",
    template: "%s · Operations Exception Manager",
  },
  description:
    "AI operations exception manager for luxury hotel groups: one issue history across guest complaints, work orders, reviews and SOPs.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${dmSans.variable} ${notoSans.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
