import { describe, expect, it, vi } from "vitest";
import { getActiveNavigationUrl } from "@/lib/navigation";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/components/logo", () => ({
  default: () => <div>Logo</div>,
}));

vi.mock("@/components/nav-main", () => ({
  NavMain: ({ items = [], label }: { items?: Array<{ title: string }>; label?: string }) => (
    <nav data-nav-main={label ?? "main"}>{items.map((item) => item.title).join("|")}</nav>
  ),
}));

vi.mock("@/components/nav-secondary", () => ({
  NavSecondary: ({
    items = [],
    label,
    className,
  }: {
    items?: Array<{ title: string }>;
    label?: string;
    className?: string;
  }) => (
    <nav data-nav-secondary={label ?? className ?? "secondary"}>
      {items.map((item) => item.title).join("|")}
    </nav>
  ),
}));

vi.mock("@/components/nav-user", () => ({
  NavUser: ({ user }: { user: { name: string } }) => <div data-nav-user>{user.name}</div>,
}));

vi.mock("@/components/ui/sidebar", () => ({
  Sidebar: ({ children }: { children: React.ReactNode }) => <aside>{children}</aside>,
  SidebarContent: ({ children }: { children: React.ReactNode }) => (
    <section data-sidebar-content>{children}</section>
  ),
  SidebarFooter: ({ children }: { children: React.ReactNode }) => (
    <footer data-sidebar-footer>{children}</footer>
  ),
  SidebarHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  SidebarMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarMenuItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useSidebar: () => ({ setOpenMobile: vi.fn() }),
}));

vi.mock("@/state/session", () => ({
  useSessionStore: (selector: (state: any) => unknown) =>
    selector({
      session: {
        unreadSupportTicketsCount: 2,
        adminUnreadSupportTicketsCount: 5,
      },
    }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

import { AppSidebar } from "@/components/app-sidebar";

function getSection(markup: string, startMarker: string, endMarker: string) {
  const start = markup.indexOf(startMarker);
  const end = markup.indexOf(endMarker, start);

  return start >= 0 && end >= 0 ? markup.slice(start, end) : "";
}

function expectOrderedTitles(markup: string, titles: string[]) {
  let previousIndex = -1;

  for (const title of titles) {
    const index = markup.indexOf(title);
    expect(index, `expected to find ${title}`).toBeGreaterThan(-1);
    expect(index, `expected ${title} to appear after the previous item`).toBeGreaterThan(
      previousIndex,
    );
    previousIndex = index;
  }
}

describe("sidebar navigation guards", () => {
  it("places the agency identity above the account menu and omits it without a name", () => {
    const user = { name: "Taki Khan", email: "taki@example.com", avatar: "" };
    const markup = renderToStaticMarkup(<AppSidebar user={user} agencyName="Northstar Visas" />);
    const footer = getSection(markup, '<footer data-sidebar-footer="true">', "</footer>");
    expectOrderedTitles(footer, ["Current agency", "Northstar Visas", "Taki Khan"]);
    expect(footer).toContain('href="/dashboard/agency"');
    expect(renderToStaticMarkup(<AppSidebar user={user} />)).not.toContain("Current agency");
  });

  it("keeps settings with admin, support, help, and announcements in the bottom group", () => {
    const markup = renderToStaticMarkup(
      <AppSidebar
        isAdmin
        announcementsUnreadCount={3}
        user={{ name: "Taki Khan", email: "taki@example.com", avatar: "" }}
      />,
    );
    const contentSection = getSection(
      markup,
      '<section data-sidebar-content="true">',
      "</section>",
    );
    const footerSection = getSection(markup, '<footer data-sidebar-footer="true">', "</footer>");

    const secondarySection = getSection(
      contentSection,
      '<nav data-nav-secondary="mt-auto">',
      "</nav>",
    );
    expectOrderedTitles(secondarySection, [
      "Admin",
      "Support Inbox",
      "Settings",
      "Get Help",
      "Announcements",
    ]);
    expect(secondarySection).not.toContain("Agency");
    expect(footerSection).not.toContain("Announcements");
  });

  it("renders the agency navigation in AppSidebar content", () => {
    const markup = renderToStaticMarkup(
      <AppSidebar user={{ name: "Taki Khan", email: "taki@example.com", avatar: "" }} />,
    );
    const contentSection = getSection(
      markup,
      '<section data-sidebar-content="true">',
      "</section>",
    );

    const mainSection = getSection(contentSection, '<nav data-nav-main="main">', "</nav>");
    expectOrderedTitles(mainSection, ["Dashboard", "Applications", "Clients", "Team", "Reports"]);
    expect(mainSection).not.toContain("Settings");
    expect(mainSection).not.toContain("Agency");
    expect(contentSection).not.toContain("Issues");
    expect(contentSection).not.toContain("Documents");
    expectOrderedTitles(contentSection, ["Settings", "Get Help", "Announcements"]);
  });
});

describe("active sidebar route", () => {
  const items = [
    { url: "/dashboard" },
    { url: "/dashboard/applications" },
    { url: "/dashboard/reports" },
    { url: "/dashboard/agency" },
    { url: "/settings" },
    { url: "/admin" },
    { url: "/admin/support" },
  ];
  it.each([
    ["/dashboard", "/dashboard"],
    ["/dashboard/applications/new", "/dashboard/applications"],
    ["/dashboard/case-123", "/dashboard/applications"],
    ["/dashboard/reports/report-123", "/dashboard/reports"],
    ["/dashboard/agency", "/dashboard/agency"],
    ["/settings/security", "/settings"],
    ["/admin/support", "/admin/support"],
    ["/admin/users/user-123", "/admin"],
    ["/dashboard/support", undefined],
    ["/dashboard/announcements", undefined],
    ["/administrator", undefined],
  ])("selects the route for %s", (pathname, expected) => {
    expect(getActiveNavigationUrl({ pathname, items })).toBe(expected);
  });
});
