import type { Metadata } from "next";
import { ApplicationOverviewContent } from "./_overview-content";

export const metadata: Metadata = {
  title: "Application overview",
};

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ appId: string }>
}) {
  const { appId } = await params
  return await ApplicationOverviewContent({ appId })
}
