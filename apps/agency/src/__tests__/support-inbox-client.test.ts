import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import {
  createInitialTicketListState,
  ticketListReducer,
} from "@/components/admin/support-inbox-client";

const baseTicket: any = {
  id: "ticket_1",
  subject: "Cannot upload documents",
  category: "bug",
  status: "open",
  priority: "medium",
  description: "Upload flow fails on the checklist step",
  screenshotUrls: null,
  adminNote: null,
  resolvedAt: null,
  lastViewedAt: null,
  adminLastViewedAt: null,
  lastUpdatedAt: new Date("2026-10-06T10:30:00.000Z"),
  userAgent: null,
  ipAddress: null,
  createdAt: new Date("2026-10-06T09:30:00.000Z"),
  updatedAt: new Date("2026-10-06T10:30:00.000Z"),
  userId: "user_1",
  userFirstName: "Ava",
  userLastName: "Stone",
  userEmail: "ava@example.com",
  userAvatar: null,
  lastMessageContent: "The upload button keeps spinning.",
  lastMessageIsAdminReply: false,
  lastMessageIsSystemMessage: false,
  messageSearchText: "The upload button keeps spinning.",
};

const closedTicket: any = {
  ...baseTicket,
  id: "ticket_2",
  status: "closed",
  subject: "Resolved upload issue",
  lastMessageContent: "Issue fixed.",
};

describe("SupportInboxClient request state", () => {
  it("ignores stale filter responses after a newer filter request starts", () => {
    const initialState = createInitialTicketListState({
      tickets: [baseTicket],
    });

    const firstRequestState = ticketListReducer(initialState, {
      type: "START_REQUEST",
      requestId: 1,
      mode: "replace",
    });
    const secondRequestState = ticketListReducer(firstRequestState, {
      type: "START_REQUEST",
      requestId: 2,
      mode: "replace",
    });

    const staleResponseState = ticketListReducer(secondRequestState, {
      type: "RESOLVE_REQUEST",
      requestId: 1,
      mode: "replace",
      page: 1,
      tickets: [closedTicket],
    });
    const settledState = ticketListReducer(staleResponseState, {
      type: "FINISH_REQUEST",
      requestId: 1,
      mode: "replace",
    });

    expect(settledState.tickets).toEqual([baseTicket]);
    expect(settledState.activeRequestId).toBe(2);
    expect(settledState.isFiltering).toBe(true);
  });

  it("ignores stale load-more responses once a replacement request takes over", () => {
    const initialState = createInitialTicketListState({
      tickets: [baseTicket],
    });

    const loadingMoreState = ticketListReducer(initialState, {
      type: "START_REQUEST",
      requestId: 1,
      mode: "append",
    });
    const replacementState = ticketListReducer(loadingMoreState, {
      type: "START_REQUEST",
      requestId: 2,
      mode: "replace",
    });

    const staleAppendState = ticketListReducer(replacementState, {
      type: "RESOLVE_REQUEST",
      requestId: 1,
      mode: "append",
      page: 2,
      tickets: [closedTicket],
    });
    const resolvedReplacementState = ticketListReducer(staleAppendState, {
      type: "RESOLVE_REQUEST",
      requestId: 2,
      mode: "replace",
      page: 1,
      tickets: [closedTicket],
    });

    expect(resolvedReplacementState.tickets).toEqual([closedTicket]);
    expect(resolvedReplacementState.currentPage).toBe(1);
    expect(resolvedReplacementState.isLoadingMore).toBe(false);
    expect(resolvedReplacementState.isFiltering).toBe(true);
  });
});
