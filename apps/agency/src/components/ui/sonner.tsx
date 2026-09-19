"use client";

import { CircleCheck, Info, OctagonX, TriangleAlert } from "lucide-react";
import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheck className="h-5 w-5" />,
        info: <Info className="h-5 w-5" />,
        warning: <TriangleAlert className="h-5 w-5" />,
        error: <OctagonX className="h-5 w-5" />,
        loading: <span className="hidden" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:rounded-xl group-[.toaster]:border group-[.toaster]:border-border/70 group-[.toaster]:bg-card/98 group-[.toaster]:text-foreground group-[.toaster]:shadow-xl group-[.toaster]:backdrop-blur-sm font-sans",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground font-medium",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-foreground font-medium",
          closeButton:
            "group-[.toast]:border-border/60 group-[.toast]:bg-card/80 group-[.toast]:text-muted-foreground hover:group-[.toast]:bg-accent/60 hover:group-[.toast]:text-foreground transition-colors",
          success: "[&>[data-icon]]:text-status-success",
          error: "[&>[data-icon]]:text-destructive",
          warning: "[&>[data-icon]]:text-status-warning",
          info: "[&>[data-icon]]:text-status-info",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
