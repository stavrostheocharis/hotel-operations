import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

/**
 * DESIGN.md → Status colors. `critical | warning | success | info` are the only
 * variants that carry issue state; `default` is the neutral chip (detected /
 * new). Status is always paired with a text label, never colour alone.
 */
const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border px-2 text-micro whitespace-nowrap transition-colors focus-visible:shadow-focus focus-visible:outline-none has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        /** Neutral: ink on `surface-soft` with a hairline. Issue states: detected, new. */
        default: "border-border bg-secondary text-foreground [a]:hover:bg-surface-hover",
        /** Quiet count chip on `surface-footer`. */
        secondary:
          "border-transparent bg-muted text-muted-foreground [a]:hover:bg-surface-hover",
        /** Brand chip. Rare: blue is punctuation, not decoration. */
        primary:
          "border-transparent bg-primary text-primary-foreground [a]:hover:bg-primary-active",
        outline: "border-border text-foreground [a]:hover:bg-muted",
        ghost: "border-transparent text-foreground hover:bg-muted",
        link: "border-transparent text-primary underline-offset-4 hover:underline",
        /** Reopened, overdue against its time limit, safety. */
        critical: "border-critical-border bg-critical-bg text-critical",
        /** Resolved but awaiting verification, cluster suspected. */
        warning: "border-warning-border bg-warning-bg text-warning",
        /** Verified fixed. */
        success: "border-success-border bg-success-bg text-success",
        /** Assigned, in progress (violet, never blue). */
        info: "border-info-border bg-info-bg text-info",
        /** Alias of `critical`, kept so shadcn-generated code keeps working. */
        destructive: "border-critical-border bg-critical-bg text-critical",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
