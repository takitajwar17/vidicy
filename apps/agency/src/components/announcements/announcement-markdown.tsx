"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function AnnouncementMarkdown({ children }: { children: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>;
}
