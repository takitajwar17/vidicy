import { describe, expect, it } from "vitest";

import {
  buildAnnouncementDateRange,
  getAnnouncementActorProfile,
  getAnnouncementEmbed,
  shouldShowAnnouncementPollResults,
} from "@/lib/announcements";

describe("announcement helpers", () => {
  it("keeps poll results hidden until the viewer has voted or the poll is closed", () => {
    expect(
      shouldShowAnnouncementPollResults({
        hasVoted: false,
        pollCloseAt: new Date("2026-10-06T12:00:00.000Z"),
        now: new Date("2026-10-03T12:00:00.000Z"),
      }),
    ).toBe(false);

    expect(
      shouldShowAnnouncementPollResults({
        hasVoted: true,
        pollCloseAt: new Date("2026-10-06T12:00:00.000Z"),
        now: new Date("2026-10-03T12:00:00.000Z"),
      }),
    ).toBe(true);

    expect(
      shouldShowAnnouncementPollResults({
        hasVoted: false,
        pollCloseAt: new Date("2026-09-29T12:00:00.000Z"),
        now: new Date("2026-10-03T12:00:00.000Z"),
      }),
    ).toBe(true);
  });

  it("expands day filters to inclusive day boundaries", () => {
    const range = buildAnnouncementDateRange({
      dateFrom: "2026-10-03",
      dateTo: "2026-10-03",
    });

    expect(range.dateFrom?.toISOString()).toBe("2026-10-03T00:00:00.000Z");
    expect(range.dateTo?.toISOString()).toBe("2026-10-03T23:59:59.999Z");
  });

  it("allows only supported announcement embeds", () => {
    expect(getAnnouncementEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      provider: "youtube",
      src: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    });

    expect(getAnnouncementEmbed("https://example.com/video")).toBeNull();
  });

  it("masks admin identities as the founder profile in announcement surfaces", () => {
    expect(
      getAnnouncementActorProfile({
        firstName: "Real",
        lastName: "Admin",
        email: "admin@example.com",
        avatar: "https://example.com/admin.png",
        role: "admin",
      }),
    ).toEqual({
      name: "Anian",
      email: null,
      avatar: "/founder-avatar.jpeg",
    });
  });

  it("keeps non-admin announcement identities unchanged", () => {
    expect(
      getAnnouncementActorProfile({
        firstName: "Taki",
        lastName: "Khan",
        email: "taki@example.com",
        avatar: "https://example.com/taki.png",
        role: "user",
      }),
    ).toEqual({
      name: "Taki Khan",
      email: "taki@example.com",
      avatar: "https://example.com/taki.png",
    });
  });
});
