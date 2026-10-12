import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("zsa-react", () => ({ useServerAction: () => ({ execute: vi.fn(), isPending: false }) }));
vi.mock("@/components/csrf-provider", () => ({ useCsrfToken: () => "test-csrf" }));
vi.mock("@/app/(settings)/settings/settings.action", () => ({ updateUserProfileAction: vi.fn() }));

import { SettingsForm } from "@/app/(settings)/settings/settings-form";

// No browser effects or client session request run during server rendering.
describe("profile form initial render", () => {
  it("renders the verified page user before the client session store is ready", () => {
    const html = renderToStaticMarkup(
      <SettingsForm
        user={{
          id: "user_1",
          firstName: "Ready",
          lastName: "Reviewer",
          email: "ready@example.test",
        }}
      />,
    );
    expect(html).toContain("Profile Settings");
    expect(html).toContain('value="Ready"');
    expect(html).toContain('value="Reviewer"');
    expect(html).toContain('value="ready@example.test"');
    expect(html).toContain("Save changes");
  });
});
