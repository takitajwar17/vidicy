import { requirePageSession } from "@/utils/auth-page";
import { logger } from "@/infra/logger";
import { notFound } from "next/navigation";
import { getSupportTicketById, markTicketAsViewed } from "@/server/support";
import { PageHeader } from "@/components/page-header";
import { UserTicketDetail } from "@/components/support/user-ticket-detail";
import type { Route } from "next";

export default async function TicketPage({ params }: { params: Promise<{ ticketId: string }> }) {
  const [, { ticketId }] = await Promise.all([requirePageSession(), params]);

  try {
    const ticket = await getSupportTicketById({ ticketId });

    markTicketAsViewed({ ticketId }).catch((error) => {
      logger.warn("Failed to mark support ticket as viewed", { ticketId, error });
    });

    return (
      <>
        <PageHeader
          items={[
            { href: "/dashboard", label: "Dashboard" },
            { href: "/dashboard/support", label: "Support" },
            { href: `/dashboard/support/${ticketId}` as Route, label: ticket.subject },
          ]}
        />
        <div className="flex flex-col px-4 lg:px-6 py-4 h-[calc(100vh-10rem)]">
          <div className="flex-1 border rounded-xl overflow-hidden shadow-xs">
            <UserTicketDetail ticket={ticket as any} backHref="/dashboard/support" />
          </div>
        </div>
      </>
    );
  } catch (error) {
    logger.error("Error fetching support ticket", { error });
    notFound();
  }
}
