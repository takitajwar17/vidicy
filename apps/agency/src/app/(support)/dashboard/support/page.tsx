import { requirePageSession } from "@/utils/auth-page";
import { getUserSupportTicketSummaries } from "@/server/support";
import { UserInboxClient } from "@/components/support/user-inbox-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Support",
  description: "Get help, track your support requests",
};

export default async function SupportPage() {
  await requirePageSession();

  const { tickets, totalCount } = await getUserSupportTicketSummaries();

  return (
    <div className="flex flex-col h-svh overflow-hidden">
      <UserInboxClient initialTickets={tickets as any} totalCount={totalCount} />
    </div>
  );
}
