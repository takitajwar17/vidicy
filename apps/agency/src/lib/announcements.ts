export type AnnouncementAttachment = {
  label: string;
  url: string;
};

export type AnnouncementCta = {
  label: string;
  url: string;
};

export type AnnouncementEmbed = {
  provider: "youtube" | "loom" | "vimeo" | "google_docs" | "google_drive";
  src: string;
};

export const ANNOUNCEMENT_ADMIN_PROFILE = {
  name: "Anian",
  avatar: "/founder-avatar.jpeg",
} as const;

export function getAnnouncementActorProfile(input: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  avatar?: string | null;
  role?: string | null;
}) {
  if (input.role?.toLowerCase() === "admin") {
    return {
      name: ANNOUNCEMENT_ADMIN_PROFILE.name,
      email: null,
      avatar: ANNOUNCEMENT_ADMIN_PROFILE.avatar,
    };
  }

  return {
    name: [input.firstName, input.lastName].filter(Boolean).join(" ").trim() || input.email || "User",
    email: input.email ?? null,
    avatar: input.avatar ?? null,
  };
}

export function shouldShowAnnouncementPollResults(input: {
  hasVoted: boolean;
  pollCloseAt?: Date | string | null;
  now?: Date | string | number;
}) {
  if (input.hasVoted) {
    return true;
  }

  if (!input.pollCloseAt) {
    return false;
  }

  const pollCloseAt =
    input.pollCloseAt instanceof Date ? input.pollCloseAt : new Date(input.pollCloseAt);
  const now =
    input.now instanceof Date
      ? input.now
      : input.now !== undefined
        ? new Date(input.now)
        : new Date();

  if (Number.isNaN(pollCloseAt.getTime()) || Number.isNaN(now.getTime())) {
    return false;
  }

  return pollCloseAt.getTime() <= now.getTime();
}

function parseDateBoundary(value?: string, endOfDay = false) {
  if (!value) {
    return undefined;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }

  return new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
}

export function buildAnnouncementDateRange(input: { dateFrom?: string; dateTo?: string }) {
  return {
    dateFrom: parseDateBoundary(input.dateFrom),
    dateTo: parseDateBoundary(input.dateTo, true),
  };
}

export function getAnnouncementEmbed(url: string): AnnouncementEmbed | null {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, "").toLowerCase();
    const pathname = parsed.pathname;

    if (hostname === "youtube.com" || hostname === "m.youtube.com") {
      const videoId = parsed.searchParams.get("v");
      if (videoId) {
        return {
          provider: "youtube",
          src: `https://www.youtube.com/embed/${videoId}`,
        };
      }
    }

    if (hostname === "youtu.be") {
      const videoId = pathname.split("/").filter(Boolean)[0];
      if (videoId) {
        return {
          provider: "youtube",
          src: `https://www.youtube.com/embed/${videoId}`,
        };
      }
    }

    if (hostname === "loom.com") {
      const [, kind, videoId] = pathname.split("/").filter(Boolean);
      if (kind === "share" && videoId) {
        return {
          provider: "loom",
          src: `https://www.loom.com/embed/${videoId}`,
        };
      }
    }

    if (hostname === "vimeo.com") {
      const videoId = pathname.split("/").filter(Boolean)[0];
      if (videoId && /^\d+$/.test(videoId)) {
        return {
          provider: "vimeo",
          src: `https://player.vimeo.com/video/${videoId}`,
        };
      }
    }

    if (hostname === "docs.google.com") {
      const match = pathname.match(/^\/(document|presentation|spreadsheets)\/d\/([^/]+)/);
      if (match) {
        return {
          provider: "google_docs",
          src: `https://docs.google.com/${match[1]}/d/${match[2]}/preview`,
        };
      }
    }

    if (hostname === "drive.google.com") {
      const match = pathname.match(/^\/file\/d\/([^/]+)/);
      if (match) {
        return {
          provider: "google_drive",
          src: `https://drive.google.com/file/d/${match[1]}/preview`,
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}
