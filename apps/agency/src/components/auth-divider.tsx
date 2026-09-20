import type React from "react";

/**
 * Horizontal divider with centered text label — used between
 * social-login buttons and the email form on auth pages.
 */
export function AuthDivider({
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div className="relative flex items-center gap-3 py-2" {...props}>
      <div className="h-px flex-1 bg-border" />
      <span className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground/80">
        {children}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
