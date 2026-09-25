import { describe, expect, it } from "vitest";

import { getTopicSubscriptionsForSync } from "@/server/marketing/contact-sync";

describe("getTopicSubscriptionsForSync", () => {
  it("only sends explicit opt-outs until webhook reconciliation exists", () => {
    const subscriptions = getTopicSubscriptionsForSync({
      subscribedOnboarding: true,
      subscribedPostPurchase: false,
      subscribedWinback: true,
    }, {
      onboarding: "topic_onboarding",
      "post-purchase": "topic_post_purchase",
      "win-back": "topic_winback",
    });

    expect(subscriptions).toEqual([
      {
        id: "topic_post_purchase",
        subscription: "opt_out",
      },
    ]);
  });
});
