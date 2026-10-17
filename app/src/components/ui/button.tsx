import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

/**
 * DESIGN.md → Shape: pill buttons, 40px default, 48px large; icon buttons are
 * circles. Blue (`primary`) is for the one primary action per view; everything
 * else is secondary or ghost. Focus = double ring via `shadow-focus`.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding text-body-strong whitespace-nowrap transition-colors outline-none select-none focus-visible:shadow-focus focus-visible:outline-none active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:text-text-disabled aria-invalid:border-critical [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary-active aria-expanded:bg-primary-active disabled:bg-secondary",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-surface-hover aria-expanded:bg-surface-hover disabled:bg-secondary",
        outline:
          "border-border bg-background text-foreground hover:bg-muted aria-expanded:bg-muted disabled:border-border",
        ghost:
          "text-foreground hover:bg-muted hover:text-foreground aria-expanded:bg-muted",
        destructive:
          "border-critical-border bg-critical-bg text-critical hover:bg-critical/15 aria-expanded:bg-critical/15 disabled:border-transparent disabled:bg-secondary",
        link: "rounded-xs text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-10 gap-2 px-5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        lg: "h-12 gap-2 px-6 text-body-lg font-medium has-data-[icon=inline-end]:pr-5 has-data-[icon=inline-start]:pl-5",
        sm: "h-8 gap-1.5 px-3.5 text-caption-lg has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3 [&_svg:not([class*='size-'])]:size-3.5",
        xs: "h-7 gap-1 px-3 text-caption has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 [&_svg:not([class*='size-'])]:size-3",
        icon: "size-10",
        "icon-lg": "size-12 [&_svg:not([class*='size-'])]:size-5",
        "icon-sm": "size-8 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  nativeButton,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      // A button rendered as a link (`render={<Link/>}`) is not a native <button>.
      nativeButton={nativeButton ?? !props.render}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
