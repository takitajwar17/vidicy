"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useServerAction } from "zsa-react";
import { deleteSessionAction } from "./sessions.action";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { SessionWithMeta } from "@/types";
import { capitalize } from 'remeda'


const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

export function SessionsClient({ sessions }: { sessions: SessionWithMeta[] }) {
  const router = useRouter();
  const dialogCloseRef = React.useRef<HTMLButtonElement>(null);
  const { execute: deleteSession } = useServerAction(deleteSessionAction, {
    onSuccess: () => {
      toast.success("Device signed out");
      dialogCloseRef.current?.click();
      router.refresh();
    }
  });

  return (
    <div className="flex flex-col gap-4">
      {sessions.map((session) => (
        <Card key={session.id} className={cn(
          "overflow-hidden rounded-xl border-border/80 shadow-[var(--shadow-dashboard)] transition-colors",
          session.isCurrentSession && "border-primary/25 bg-primary/[0.04]"
        )}>
          <CardHeader className="p-4 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex-1 space-y-1.5 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base font-semibold truncate max-w-full">
                    {session.city && session.country
                      ? `${session.city}, ${regionNames.of(session.country)}`
                      : session.country || "Unknown location"}
                  </CardTitle>
                  {session.isCurrentSession && (
                    <Badge variant="outline" className="border-primary/25 bg-primary/10 text-primary">
                      Current session
                    </Badge>
                  )}
                  {session?.authenticationType && (
                    <Badge variant="outline" className="font-normal text-xs">
                      {capitalize(session?.authenticationType ?? "password")?.replace("-", " ")}
                    </Badge>
                  )}
                </div>
                
                <div className="flex flex-wrap items-center text-xs text-muted-foreground gap-x-1.5 gap-y-1">
                  <span className="font-mono tabular-nums">
                    {formatDistanceToNow(session.createdAt)} ago
                  </span>
                  <span>•</span>
                  <span className="truncate">
                    {session.parsedUserAgent?.browser.name ?? "Unknown browser"} on {session.parsedUserAgent?.os.name ?? "Unknown OS"}
                  </span>
                </div>

                <CardDescription className="text-xs line-clamp-2 sm:line-clamp-none">
                  {session.parsedUserAgent?.device.vendor ?? ""} {session.parsedUserAgent?.device.model ?? ""} 
                  {(!session.parsedUserAgent?.device.vendor && !session.parsedUserAgent?.device.model) && "Generic Device"}
                  <span className="hidden sm:inline"> • {session.parsedUserAgent?.browser.name} {session.parsedUserAgent?.browser.major}</span>
                </CardDescription>
              </div>

              <div className="shrink-0 flex items-center justify-end">
                {!session?.isCurrentSession && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="destructive" className="w-full sm:w-auto h-8 text-xs bg-destructive/10 text-destructive hover:bg-destructive/20 border-destructive/20">
                        Sign out device
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                      <DialogHeader>
                        <DialogTitle>Sign out this device?</DialogTitle>
                        <DialogDescription>
                          This will sign out this device. This action cannot be undone.
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter className="mt-6 flex flex-col sm:flex-row gap-2">
                        <DialogClose ref={dialogCloseRef} asChild>
                          <Button variant="outline" className="w-full sm:w-auto">Cancel</Button>
                        </DialogClose>
                        <Button
                          variant="destructive"
                          className="w-full sm:w-auto"
                          onClick={() => deleteSession({ sessionId: session.id })}
                        >
                          Sign out device
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </div>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
