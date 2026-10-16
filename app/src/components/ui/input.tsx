import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "@/lib/utils"

/** DESIGN.md → Shape: inputs are 12px (`rounded-lg`), 40px tall, hairline
 *  border, double focus ring. 16px text below `md` stops iOS zooming on focus. */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-base text-foreground transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-body-strong file:text-foreground placeholder:text-muted-foreground focus-visible:border-input focus-visible:shadow-focus focus-visible:outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-secondary disabled:text-text-disabled disabled:placeholder:text-text-disabled aria-invalid:border-critical md:text-body",
        className
      )}
      {...props}
    />
  )
}

export { Input }
