import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "ui-feedback inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium tracking-tight ring-offset-background transition-[background-color,color,box-shadow,border-color,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-[busy=true]:cursor-wait aria-[busy=true]:opacity-85 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover hover:shadow-sm active:bg-primary-strong",
        destructive:
          "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive-hover hover:shadow-sm active:bg-destructive-strong",
        outline:
          "border border-input bg-background text-foreground shadow-2xs hover:border-primary/30 hover:bg-accent/75 hover:text-accent-foreground active:bg-accent",
        secondary:
          "bg-secondary text-secondary-foreground shadow-2xs hover:bg-secondary/84 hover:text-foreground active:bg-secondary/88",
        ghost: "text-muted-foreground hover:bg-accent/80 hover:text-accent-foreground active:bg-accent",
        link: "text-primary underline-offset-4 hover:underline",
        hero:
          "rounded-xl bg-gradient-to-b from-[hsl(24,100%,72%)] to-[hsl(18,98%,53%)] text-lg font-medium text-primary-foreground shadow-md hover:brightness-[1.03] hover:shadow-lg active:brightness-[0.98]",
        "hero-outline":
          "rounded-xl border border-border/60 bg-secondary text-lg font-medium text-secondary-foreground shadow-xs hover:bg-muted",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3 text-xs",
        lg: "h-11 px-8 text-sm",
        xl: "h-14 px-10 py-4",
        icon: "h-10 w-10 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
