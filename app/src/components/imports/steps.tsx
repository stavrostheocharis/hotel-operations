import { CheckIcon } from "lucide-react";

import { t } from "@/i18n";
import { cn } from "@/lib/utils";

export type StepKey = "upload" | "check" | "load" | "link";
const STEPS: StepKey[] = ["upload", "check", "load", "link"];

/**
 * The wizard's four steps in a row: done ones ticked, the current one in
 * ink, the rest muted. `failed` paints the current step critical.
 */
export function Steps({ current, done, failed }: { current: StepKey | "done"; done?: boolean; failed?: boolean }) {
  const idx = current === "done" ? STEPS.length : STEPS.indexOf(current);
  return (
    <ol className="flex flex-wrap items-center gap-2 text-body">
      {STEPS.map((key, i) => {
        const complete = i < idx || (done && i === idx);
        const active = i === idx && !done;
        return (
          <li key={key} className="flex items-center gap-2">
            {i > 0 ? <span className="mx-1 h-px w-6 bg-border" aria-hidden /> : null}
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full border text-micro tabular-nums",
                complete ? "border-foreground bg-foreground text-background" : active ? (failed ? "border-critical text-critical" : "border-foreground text-foreground") : "border-border text-muted-foreground",
              )}
            >
              {complete ? <CheckIcon className="size-3.5" /> : i + 1}
            </span>
            <span className={cn(complete || active ? "text-foreground" : "text-muted-foreground", active && "font-medium")}>{t(`imports.steps.${key}`)}</span>
          </li>
        );
      })}
    </ol>
  );
}
