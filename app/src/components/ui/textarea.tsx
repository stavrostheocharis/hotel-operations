import * as React from "react"
import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-20 w-full rounded-lg border border-input bg-background px-3 py-2 text-base text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-input focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-secondary disabled:text-text-disabled aria-invalid:border-critical md:text-body",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
