import { requireAdminPageSession } from "@/utils/auth-page"
import { getAllSupportTicketSummaries, getSupportTicketById } from "@/server/support"
import { SupportInboxClient } from "@/components/admin/support-inbox-client"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Support inbox",
  description: "Manage user support tickets",
}

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>
}) {
  await requireAdminPageSession()

  const { id } = await searchParams
  const { tickets: allTickets, totalCount } = await getAllSupportTicketSummaries({ page: 1 })
  const initialSelectedTicket = id && allTickets.some((ticket) => ticket.id === id)
    ? await getSupportTicketById({ ticketId: id }).catch(() => null)
    : null

  return (
    <div className="flex flex-col h-screen h-svh overflow-hidden">
      <SupportInboxClient
        initialTickets={allTickets as any}
        totalCount={totalCount}
        initialSelectedId={id}
        initialSelectedTicket={initialSelectedTicket as any}
      />
    </div>
  )
}
