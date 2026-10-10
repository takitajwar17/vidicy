interface NavigationItem {
  url: string;
}

export function getActiveNavigationUrl({
  pathname,
  items,
}: {
  pathname: string;
  items: NavigationItem[];
}): string | undefined {
  const route =
    /^\/dashboard\/[^/]+$/.test(pathname) &&
    !new Set([
      "applications",
      "issues",
      "clients",
      "documents",
      "team",
      "reports",
      "support",
      "announcements",
    ]).has(pathname.split("/")[2])
      ? "/dashboard/applications"
      : pathname;
  return items
    .filter(
      (item) =>
        route === item.url || (item.url !== "/dashboard" && route.startsWith(`${item.url}/`)),
    )
    .sort((a, b) => b.url.length - a.url.length)[0]?.url;
}
