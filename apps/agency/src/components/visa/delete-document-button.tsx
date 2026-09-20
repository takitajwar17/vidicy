"use client"

import { useServerAction } from "zsa-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { Trash2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { deleteDocumentAction } from "@/actions/document.action"

interface DeleteDocumentButtonProps {
  documentId: string
  applicationId: string
  fileName: string
}

export function DeleteDocumentButton({ documentId, applicationId, fileName }: DeleteDocumentButtonProps) {
  const router = useRouter()

  const { execute, isPending } = useServerAction(deleteDocumentAction, {
    onSuccess: () => {
      toast.success("Document deleted")
      router.refresh()
    },
    onError: ({ err }) => {
      toast.error(err.message || "Failed to delete document")
    },
  })

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all"
          disabled={isPending}
          aria-label="Delete document"
        >
          <Trash2Icon className="h-3.5 w-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Document</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to permanently delete <span className="font-medium">&ldquo;{fileName}&rdquo;</span>? This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => execute({ documentId, applicationId })}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
