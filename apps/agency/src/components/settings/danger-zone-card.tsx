"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useServerAction } from "zsa-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { useCsrfToken } from "@/components/csrf-provider";
import { deleteAccountAction, exportUserDataAction } from "@/actions/account.action";
import { Download, Trash2, Loader2 } from "lucide-react";

export function DangerZoneCard() {
  const router = useRouter();
  const csrfToken = useCsrfToken();
  const [confirmText, setConfirmText] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const { execute: executeExport, isPending: isExporting } =
    useServerAction(exportUserDataAction);

  const { execute: executeDelete, isPending: isDeleting } =
    useServerAction(deleteAccountAction);

  async function handleExport() {
    const [data, error] = await executeExport({ csrfToken });
    if (error) {
      toast.error("Failed to export data", { description: error.message });
      return;
    }
    // Download as JSON file
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vidicy-data-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Data exported successfully");
  }

  async function handleDelete() {
    if (confirmText !== "DELETE MY ACCOUNT") return;

    const [, error] = await executeDelete({
      confirmationText: "DELETE MY ACCOUNT",
      csrfToken,
    });

    if (error) {
      toast.error("Failed to delete account", { description: error.message });
      return;
    }

    toast.success("Account deleted successfully");
    router.push("/sign-in");
  }

  return (
    <Card className="rounded-xl border-destructive/50 shadow-[var(--shadow-dashboard)]">
      <CardHeader>
        <CardTitle className="text-destructive">Danger Zone</CardTitle>
        <CardDescription>
          Actions that remove your account data from the review desk.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Data Export */}
        <div className="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-0.5">
            <span className="text-sm font-medium">Export My Data</span>
            <p className="text-xs text-muted-foreground">
              Download your profile, sign-in, and review-desk account records as JSON.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={isExporting}
          >
            {isExporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Export
          </Button>
        </div>

        {/* Account Deletion */}
        <div className="flex flex-col gap-4 rounded-lg border border-destructive/30 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-0.5">
            <span className="text-sm font-medium">Delete My Account</span>
            <p className="text-xs text-muted-foreground">
              Permanently delete your account and all data, including
              client files, documents, and review history.
            </p>
          </div>
          <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Are you absolutely sure?
                </AlertDialogTitle>
                <AlertDialogDescription className="space-y-2">
                  <span className="block">
                    This action is <strong>permanent and irreversible</strong>.
                    It will delete:
                  </span>
                  <span className="block">
                    • All visa cases, documents, and evaluations
                    <br />
                    • All uploaded files from cloud storage
                    <br />
                    • All chat history and generated review content
                    <br />
                    • All support tickets
                    <br />
                    • Your account and profile information
                  </span>
                  <span className="block mt-4">
                    Type{" "}
                    <strong className="font-mono text-foreground">
                      DELETE MY ACCOUNT
                    </strong>{" "}
                    to confirm.
                  </span>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE MY ACCOUNT"
                className="font-mono"
                autoComplete="off"
              />
              <AlertDialogFooter>
                <AlertDialogCancel
                  onClick={() => setConfirmText("")}
                >
                  Cancel
                </AlertDialogCancel>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={
                    confirmText !== "DELETE MY ACCOUNT" || isDeleting
                  }
                >
                  {isDeleting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  Delete Forever
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
