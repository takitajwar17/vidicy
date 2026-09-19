import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[96px] w-full rounded-lg border border-input bg-background/95 px-3.5 py-2.5 text-sm ring-offset-background shadow-2xs transition-[border-color,box-shadow,background-color,color] placeholder:text-muted-foreground/90 hover:border-border/80 focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15 focus-visible:ring-offset-0 aria-[invalid=true]:border-destructive/70 aria-[invalid=true]:ring-4 aria-[invalid=true]:ring-destructive/15 disabled:cursor-not-allowed disabled:bg-muted/35 disabled:text-muted-foreground",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
