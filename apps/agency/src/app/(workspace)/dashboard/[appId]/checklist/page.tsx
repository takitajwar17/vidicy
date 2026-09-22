import type { Metadata } from "next"
import { WorkspaceContent } from "../_workspace-content"

export const metadata: Metadata = {
  title: "Checklist",
}

export default async function ChecklistPage({
  params,
  searchParams,
}: {
  params: Promise<{ appId: string }>
  searchParams: Promise<{ applicant?: string }>
}) {
  const [{ appId }, { applicant }] = await Promise.all([params, searchParams])
  return <WorkspaceContent appId={appId} step="checklist" applicantId={applicant} />
}
