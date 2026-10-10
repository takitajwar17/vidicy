import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PageHeader } from "@/components/page-header";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

describe("sidebar context", () => {
  it("shares context between the page header and its layout during server rendering", () => {
    const html = renderToStaticMarkup(
      <SidebarProvider>
        <PageHeader items={[{ href: "/dashboard", label: "Dashboard" }]} />
      </SidebarProvider>,
    );
    expect(html).toContain('data-sidebar="trigger"');
    expect(html).toContain("Dashboard");
  });

  it("shares context with a separately evaluated sidebar module", async () => {
    const refreshedModulePath = "../components/ui/sidebar.tsx?sidebar-refresh-test";
    const { SidebarTrigger: RefreshedTrigger } = (await import(
      refreshedModulePath
    )) as typeof import("@/components/ui/sidebar");
    expect(() =>
      renderToStaticMarkup(
        <SidebarProvider>
          <RefreshedTrigger />
        </SidebarProvider>,
      ),
    ).not.toThrow();
  });

  it("still rejects a trigger without a provider", () => {
    expect(() => renderToStaticMarkup(<SidebarTrigger />)).toThrow(
      "useSidebar must be used within a SidebarProvider.",
    );
  });
});
