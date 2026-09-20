"use client"

import { useServerAction } from "zsa-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { CircleCheckIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { setDocumentActiveAction } from "@/actions/document.action"

interface SetDocumentActiveButtonProps {
  documentId: string
  applicationId: string
}

export function SetDocumentActiveButton({ documentId, applicationId }: SetDocumentActiveButtonProps) {
  const router = useRouter()

  const { execute, isPending } = useServerAction(setDocumentActiveAction, {
    onSuccess: () => {
      toast.success("Document set as active")
      router.refresh()
    },
    onError: ({ err }) => {
      toast.error(err.message || "Failed to update document")
    },
  })

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-primary hover:bg-primary/10 transition-all"
      disabled={isPending}
      onClick={() => execute({ documentId, applicationId })}
      aria-label="Set as active document"
    >
      <CircleCheckIcon className="h-3.5 w-3.5" />
    </Button>
  )
}
