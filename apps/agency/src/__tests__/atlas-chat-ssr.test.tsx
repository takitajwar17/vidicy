import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/image", () => ({
  default: ({ alt }: { alt?: string }) => (
    <span aria-label={alt ?? ""} data-next-image-mock="" />
  ),
}));

import { AtlasChat } from "@/components/visa/atlas-chat";

describe("AtlasChat SSR", () => {
  it("server-renders the active conversation content", () => {
    const markup = renderToStaticMarkup(
      <AtlasChat
        applicationId="vapp_123"
        initialMessages={[
          {
            id: "cmsg_user_1",
            applicationId: "vapp_123",
            conversationId: "cconv_123",
            role: "user",
            content: "How strong is my application?",
            thumbnailDataUrl: null,
            createdAt: new Date("2026-10-06T10:00:00.000Z"),
          },
          {
            id: "cmsg_assistant_1",
            applicationId: "vapp_123",
            conversationId: "cconv_123",
            role: "assistant",
            content: "Your application looks strong overall.",
            thumbnailDataUrl: null,
            createdAt: new Date("2026-10-06T10:01:00.000Z"),
          },
        ]}
        conversations={[
          {
            id: "cconv_123",
            applicationId: "vapp_123",
            name: "Application strength",
            createdAt: new Date("2026-10-06T10:00:00.000Z"),
            updatedAt: new Date("2026-10-06T10:01:00.000Z"),
          },
        ]}
        activeConversationId="cconv_123"
      />,
    );

    expect(markup).toContain("How strong is my application?");
    expect(markup).toContain("Your application looks strong overall.");
    expect(markup).toContain("Application strength");
  });
});
