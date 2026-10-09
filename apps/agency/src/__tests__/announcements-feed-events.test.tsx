import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";

const state = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));
const actions = vi.hoisted(() => ({ refresh: vi.fn(), comment: vi.fn(), error: vi.fn() }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useMemo: (factory: () => unknown) => factory(),
  useState: <T,>(initial: T | (() => T)) => {
    const slot = state.cursor++;
    const values = state.values;
    if (!(slot in values))
      values[slot] = typeof initial === "function" ? (initial as () => T)() : initial;
    return [
      values[slot],
      (next: T | ((value: T) => T)) => {
        values[slot] =
          typeof next === "function" ? (next as (value: unknown) => T)(values[slot]) : next;
      },
    ];
  },
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("sonner", () => ({ toast: { error: actions.error, success: vi.fn() } }));
vi.mock("@/actions/announcement.action", () => ({
  getAnnouncementsFeedAction: actions.refresh,
  addAnnouncementCommentAction: actions.comment,
  createAnnouncementAction: vi.fn(),
  deleteAnnouncementCommentAction: vi.fn(),
  markAnnouncementReadAction: vi.fn(),
  toggleAnnouncementUpvoteAction: vi.fn(),
  voteOnAnnouncementPollAction: vi.fn(),
}));
vi.mock("zsa-react", () => ({
  useServerAction: (
    action: (input: unknown) => Promise<[unknown, { message: string } | null]>,
    options: {
      onSuccess?: (result: { data: unknown }) => void;
      onError?: (result: { err: { message: string } }) => void;
    },
  ) => ({
    execute: async (input: unknown) => {
      const result = (await action(input)) ?? [null, null];
      if (result[1]) options.onError?.({ err: result[1] });
      else options.onSuccess?.({ data: result[0] });
      return result;
    },
    isPending: false,
  }),
}));

import { AnnouncementsFeedClient } from "@/components/announcements/announcements-feed-client";
import type { Feed, FeedPost } from "@/components/announcements/announcements-feed-model";

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as ReactNode)];
}
function find(
  node: ReactNode,
  predicate: (element: ReactElement<Record<string, unknown>>) => boolean,
) {
  const element = elements(node).find(predicate);
  if (!element) throw new Error("Expected control was not rendered");
  return element;
}
function button(node: ReactNode, label: string) {
  return find(node, (element) => element.props.children === label);
}
async function fire(element: ReactElement<Record<string, unknown>>, name: string, value?: unknown) {
  const handler = element.props[name];
  if (typeof handler !== "function") throw new Error(`Missing ${name}`);
  await handler(value);
}
function frame(render: () => ReactNode) {
  const values: unknown[] = [];
  return () => {
    state.values = values;
    state.cursor = 0;
    return render();
  };
}
function childFrame(element: ReactElement<Record<string, unknown>>) {
  const component = element.type as (props: Record<string, unknown>) => ReactNode;
  return frame(() => component(element.props));
}
const post: FeedPost = {
  id: "post_1",
  title: "Update",
  body: "Review news",
  type: "announcement",
  priority: "normal",
  pinned: false,
  commentsEnabled: true,
  pollSingleChoice: true,
  pollNamedVotes: false,
  pollAllowVoteChange: false,
  pollCloseAt: null,
  upvotesCount: 0,
  hasUpvoted: false,
  commentsCount: 1,
  isRead: false,
  pollOptions: [],
  comments: [
    {
      id: "comment_1",
      postId: "post_1",
      userId: "user_1",
      parentId: null,
      body: "Original comment",
      firstName: "Test",
      lastName: null,
      email: "test@example.com",
    },
  ],
};
const feed: Feed = { viewerRole: "user", posts: [post] };

describe("announcement controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actions.comment.mockResolvedValue([null, { message: "Comment rejected" }]);
  });

  it("clears the query sent to the server along with the search input", async () => {
    const render = frame(() =>
      AnnouncementsFeedClient({ initialFeed: { ...feed, posts: [] }, isAdmin: false }),
    );
    await fire(
      find(render(), (element) => element.props.placeholder === "Search title or body"),
      "onChange",
      { target: { value: "passport" } },
    );
    await fire(button(render(), "Clear filters"), "onClick");
    expect(actions.refresh).toHaveBeenLastCalledWith(expect.objectContaining({ q: undefined }));
    expect(
      find(render(), (element) => element.props.placeholder === "Search title or body").props.value,
    ).toBe("");
  });

  it("keeps a failed comment draft and clears it only after success", async () => {
    const parent = frame(() => AnnouncementsFeedClient({ initialFeed: feed, isAdmin: false }));
    const render = childFrame(
      find(
        parent(),
        (element) => typeof element.type === "function" && element.type.name === "PostCard",
      ),
    );
    await fire(
      find(
        render(),
        (element) => element.type === "button" && typeof element.props.onClick === "function",
      ),
      "onClick",
    );
    await fire(
      find(
        render(),
        (element) =>
          element.props.placeholder === "Share your feedback, ask a question, or add more context",
      ),
      "onChange",
      { target: { value: "My draft" } },
    );
    await fire(button(render(), "Post comment"), "onClick");
    expect(find(render(), (element) => element.props.value === "My draft")).toBeDefined();
    expect(actions.error).toHaveBeenCalledWith("Comment rejected");
    actions.refresh.mockResolvedValueOnce([
      { ...feed, posts: [{ ...post, title: "Refreshed update" }] },
      null,
    ]);
    actions.comment.mockResolvedValueOnce([{ id: "new_comment" }, null]);
    await fire(button(render(), "Post comment"), "onClick");
    expect(elements(render()).some((element) => element.props.value === "My draft")).toBe(false);
    await vi.waitFor(() => {
      const refreshed = find(
        parent(),
        (element) => typeof element.type === "function" && element.type.name === "PostCard",
      );
      expect((refreshed.props.post as FeedPost).title).toBe("Refreshed update");
    });
  });

  it("disables comment controls until submission finishes", async () => {
    const parent = frame(() => AnnouncementsFeedClient({ initialFeed: feed, isAdmin: false }));
    const render = childFrame(
      find(
        parent(),
        (element) => typeof element.type === "function" && element.type.name === "PostCard",
      ),
    );
    await fire(
      find(
        render(),
        (element) => element.type === "button" && typeof element.props.onClick === "function",
      ),
      "onClick",
    );
    await fire(
      find(
        render(),
        (element) =>
          element.props.placeholder === "Share your feedback, ask a question, or add more context",
      ),
      "onChange",
      { target: { value: "Pending draft" } },
    );
    let finish!: (value: unknown) => void;
    actions.comment.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const submission = fire(button(render(), "Post comment"), "onClick");
    expect(
      find(
        render(),
        (element) =>
          element.props.placeholder === "Share your feedback, ask a question, or add more context",
      ).props.disabled,
    ).toBe(true);
    expect(button(render(), "Post comment").props.disabled).toBe(true);
    finish([null, { message: "Comment rejected" }]);
    await submission;
    const input = find(
      render(),
      (element) =>
        element.props.placeholder === "Share your feedback, ask a question, or add more context",
    );
    expect(input.props.disabled).toBe(false);
    expect(input.props.value).toBe("Pending draft");
  });

  it("keeps a failed reply draft", async () => {
    const parent = frame(() => AnnouncementsFeedClient({ initialFeed: feed, isAdmin: false }));
    const card = childFrame(
      find(
        parent(),
        (element) => typeof element.type === "function" && element.type.name === "PostCard",
      ),
    );
    const render = childFrame(
      find(
        card(),
        (element) => typeof element.type === "function" && element.type.name === "CommentTree",
      ),
    );
    await fire(button(render(), "Reply"), "onClick");
    await fire(
      find(render(), (element) => element.props.placeholder === "Write a reply"),
      "onChange",
      { target: { value: "Reply draft" } },
    );
    await fire(button(render(), "Post reply"), "onClick");
    expect(find(render(), (element) => element.props.value === "Reply draft")).toBeDefined();
    expect(actions.error).toHaveBeenCalledWith("Comment rejected");
  });
});
