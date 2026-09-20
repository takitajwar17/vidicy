import { VisaChat } from "@/components/visa/visa-chat"
import type { ChatMessage, ChatConversation } from "@/db/schema"

export function AtlasChat({
  applicationId,
  initialMessages,
  conversations,
  activeConversationId,
  currentUser,
}: {
  applicationId: string
  initialMessages: ChatMessage[]
  conversations: ChatConversation[]
  activeConversationId: string
  currentUser?: {
    name: string
    avatar: string
    initials: string
  }
}) {
  return (
    <VisaChat
      applicationId={applicationId}
      initialMessages={initialMessages}
      conversations={conversations}
      activeConversationId={activeConversationId}
      currentUser={currentUser}
      fullScreen
    />
  )
}
