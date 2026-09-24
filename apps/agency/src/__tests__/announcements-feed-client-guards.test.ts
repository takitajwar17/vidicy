import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("announcements feed client guards", () => {
  it("uses the standard dashboard page header shell", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/app/(dashboard)/dashboard/announcements/page.tsx"),
      "utf8",
    );

    expect(source).toContain("PageHeader");
    expect(source).toContain('label: "Dashboard"');
    expect(source).toContain('label: "Announcements"');
  });

  it("does not rely on hover to mark posts as read", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/announcements/announcements-feed-client.tsx"),
      "utf8",
    );

    expect(source).not.toContain("onMouseEnter");
    expect(source).toContain("Mark as read");
  });

  it("does not contain unresolved merge markers", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/announcements/announcements-feed-client.tsx"),
      "utf8",
    );

    expect(source).not.toContain("<<<<<<<");
    expect(source).not.toContain("=======");
    expect(source).not.toContain(">>>>>>>");
  });

  it("surfaces publish failures to the user", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/announcements/announcements-feed-client.tsx"),
      "utf8",
    );

    expect(source).toContain("onError");
    expect(source).toContain("toast.error");
  });

  it("uses shadcn feed primitives for the social layout", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/announcements/announcements-feed-client.tsx"),
      "utf8",
    );

    expect(source).toContain('from "@/components/ui/card"');
    expect(source).toContain('from "@/components/ui/avatar"');
    expect(source).toContain('from "@/components/ui/sheet"');
    expect(source).toContain("Create update");
  });

  it("does not render the removed hero metrics block", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/announcements/announcements-feed-client.tsx"),
      "utf8",
    );

    expect(source).not.toContain("Internal feed");
    expect(source).not.toContain("Unread now");
    expect(source).not.toContain("Active polls");
    expect(source).not.toContain("Fresh updates that still need a look");
  });

  it("does not show a refresh feed button in the page body", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/announcements/announcements-feed-client.tsx"),
      "utf8",
    );

    expect(source).not.toContain("Refresh feed");
  });

  it("uses an arrow-style upvote button instead of a text label", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/announcements/announcements-feed-client.tsx"),
      "utf8",
    );

    expect(source).toContain("RedditUpvoteIcon");
    expect(source).toContain("aria-pressed={post.hasUpvoted}");
    expect(source).not.toContain("ChevronUpIcon");
    expect(source).not.toContain('"Upvoted" : "Upvote"} ·');
  });

  it("renders avatars and uses the founder override for masked admin identities", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/announcements/announcements-feed-client.tsx"),
      "utf8",
    );

    expect(source).toContain('from "next/image"');
    expect(source).toContain("getAnnouncementActorProfile");
    expect(source).toContain("AnnouncementActorAvatar");
  });
});
