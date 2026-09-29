import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "ui-feedback inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-bold tracking-tight ring-offset-background transition-[background-color,color,box-shadow,border-color,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-[busy=true]:cursor-wait aria-[busy=true]:opacity-85 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[var(--shadow-button-primary)] ring-1 ring-primary/10 hover:bg-primary-hover hover:shadow-[var(--shadow-button-primary-hover)] active:bg-primary-strong",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[var(--shadow-button-destructive)] ring-1 ring-destructive/10 hover:bg-destructive-hover hover:shadow-[var(--shadow-button-destructive-hover)] active:bg-destructive-strong",
        outline:
          "border border-primary/10 bg-primary text-primary-foreground shadow-[var(--shadow-button-primary)] ring-1 ring-primary/10 hover:bg-primary-hover hover:shadow-[var(--shadow-button-primary-hover)] active:bg-primary-strong",
        secondary:
          "border border-primary/10 bg-primary text-primary-foreground shadow-[var(--shadow-button-primary)] ring-1 ring-primary/10 hover:bg-primary-hover hover:shadow-[var(--shadow-button-primary-hover)] active:bg-primary-strong",
        ghost: "text-primary hover:bg-primary hover:text-primary-foreground active:bg-primary-strong",
        link: "text-primary underline-offset-4 hover:underline",
        hero:
          "bg-primary text-lg font-bold text-primary-foreground shadow-[var(--shadow-button-primary)] ring-1 ring-primary/10 hover:bg-primary-hover hover:shadow-[var(--shadow-button-primary-hover)] active:bg-primary-strong",
        "hero-outline":
          "border border-primary/10 bg-primary text-lg font-bold text-primary-foreground shadow-[var(--shadow-button-primary)] ring-1 ring-primary/10 hover:bg-primary-hover hover:shadow-[var(--shadow-button-primary-hover)] active:bg-primary-strong",
      },
      size: {
        default: "h-11 px-5 py-2",
        sm: "h-10 px-4 text-xs",
        lg: "h-12 px-8 text-sm",
        xl: "h-14 px-10 py-4",
        icon: "h-10 w-10 rounded-xl",
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
