import type { Metadata } from "next";
import { AgencyCaseContent } from "./_agency-case-content";

export const metadata: Metadata = {
  title: "Application review",
};

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ appId: string }>
}) {
  const { appId } = await params
  return await AgencyCaseContent({ appId })
}
