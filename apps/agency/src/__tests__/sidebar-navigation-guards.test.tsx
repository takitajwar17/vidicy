import { describe, expect, it, vi } from "vitest";
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
  it("keeps admin, support, help, and announcements together in AppSidebar content", () => {
    const markup = renderToStaticMarkup(
      <AppSidebar
        isAdmin
        announcementsUnreadCount={3}
        user={{ name: "Taki Khan", email: "taki@example.com", avatar: "" }}
      />,
    );
    const contentSection = getSection(markup, '<section data-sidebar-content="true">', "</section>");
    const footerSection = getSection(markup, '<footer data-sidebar-footer="true">', "</footer>");

    expectOrderedTitles(contentSection, ["Admin", "Support Inbox", "Get Help", "Announcements"]);
    expect(footerSection).not.toContain("Announcements");
  });

  it("renders the agency navigation in AppSidebar content", () => {
    const markup = renderToStaticMarkup(
      <AppSidebar user={{ name: "Taki Khan", email: "taki@example.com", avatar: "" }} />,
    );
    const contentSection = getSection(markup, '<section data-sidebar-content="true">', "</section>");

    expectOrderedTitles(contentSection, [
      "Dashboard",
      "Applications",
      "Issues",
      "Clients",
      "Documents",
      "Team",
      "Reports",
      "Settings",
    ]);
  });
});
