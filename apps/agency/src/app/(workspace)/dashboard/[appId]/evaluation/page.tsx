import type { Metadata } from "next"
import { WorkspaceContent } from "../_workspace-content"

export const metadata: Metadata = {
  title: "Evaluation",
}

export default async function EvaluationPage({
  params,
  searchParams,
}: {
  params: Promise<{ appId: string }>
  searchParams: Promise<{ applicant?: string }>
}) {
  const [{ appId }, { applicant }] = await Promise.all([params, searchParams])
  return <WorkspaceContent appId={appId} step="evaluation" applicantId={applicant} />
}
