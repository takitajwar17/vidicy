import type { Metadata, Route } from "next"
import { format } from "date-fns"
import { notFound } from "next/navigation"

import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ReadOnlyDetailsCard } from "./_components/read-only-details-card"
import { ReadOnlyTableCard } from "./_components/read-only-table-card"
import {
  getAdminApplicationDebugData,
  getUserDisplayName,
} from "./_lib/get-admin-application-debug-data"

interface AdminApplicationDetailPageProps {
  params: Promise<{ userId: string; applicationId: string }>
}

function formatDateTime(value: Date | null | undefined): string {
  if (!value) return "—"
  return format(value, "PPpp")
}

function formatBytes(bytes: number | null | undefined): string {
  if (typeof bytes !== "number") return "—"
  if (bytes === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const size = bytes / Math.pow(1024, exponent)
  return `${size.toFixed(size >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`
}

function normalizeText(value: string | null | undefined): string {
  if (!value) return "—"
  return value.replace(/_/g, " ")
}

function truncateText(value: string | null | undefined, max = 120): string {
  if (!value) return "—"
  if (value.length <= max) return value
  return `${value.slice(0, max)}...`
}

function formatBoolean(value: unknown): string {
  if (value === 1 || value === true) return "Yes"
  if (value === 0 || value === false) return "No"
  return "—"
}

export async function generateMetadata({
  params,
}: AdminApplicationDetailPageProps): Promise<Metadata> {
  const { userId, applicationId } = await params
  const data = await getAdminApplicationDebugData({ userId, applicationId })

  if (!data) {
    return {
      title: "Application not found",
      description: "The requested admin application debug view could not be found",
    }
  }

  return {
    title: `Application debug: ${data.application.id}`,
    description: `Read-only admin diagnostics for ${data.application.id}`,
  }
}

export default async function AdminApplicationDetailPage({
  params,
}: AdminApplicationDetailPageProps) {
  const { userId, applicationId } = await params
  const data = await getAdminApplicationDebugData({ userId, applicationId })

  if (!data) {
    notFound()
  }

  const ownerDisplayName = getUserDisplayName(data.owner)
  const relatedUsersById = new Map(data.relatedUsers.map((user) => [user.id, user]))

  const formatUserReference = (userId: string | null | undefined) => {
    if (!userId) return "—"
    const relatedUser = relatedUsersById.get(userId)
    if (!relatedUser) return userId
    return `${getUserDisplayName(relatedUser)} (${userId})`
  }

  return (
    <>
      <PageHeader
        items={[
          { href: "/admin", label: "Admin" },
          { href: "/admin/users", label: "Users" },
          { href: `/admin/users/${data.owner.id}` as Route, label: ownerDisplayName },
          {
            href: `/admin/users/${data.owner.id}/applications/${data.application.id}` as Route,
            label: data.application.id,
          },
        ]}
      />

      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
            <div className="px-4 lg:px-6">
              <div className="grid gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between gap-4">
                      <span>{data.application.name || "Untitled application"}</span>
	                      <div className="flex flex-wrap items-center gap-2">
	                        <Badge variant="outline" className="capitalize">
	                          {normalizeText(data.application.status)}
	                        </Badge>
	                        {data.application.trashedAt ? (
                          <Badge variant="secondary">Trashed</Badge>
                        ) : null}
                      </div>
                    </CardTitle>
                    <CardDescription>
                      Read-only admin debug view for application `{data.application.id}`.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-2 text-sm md:grid-cols-2 lg:grid-cols-3">
                      <div>
                        <span className="text-muted-foreground">Owner:</span> {ownerDisplayName}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Owner User ID:</span> {data.owner.id}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Route:</span>{" "}
                        {data.application.homeCountry} → {data.application.destinationCountry} (
                        {data.application.visaType})
                      </div>
                      <div>
                        <span className="text-muted-foreground">Embassy:</span> {data.application.embassy}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Risk level:</span>{" "}
                        {normalizeText(data.application.riskLevel)}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Readiness score:</span>{" "}
                        {data.application.readinessScore ?? "—"}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Actual outcome:</span>{" "}
                        {normalizeText(data.application.actualOutcome)}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Created:</span>{" "}
                        {formatDateTime(data.application.createdAt)}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Updated:</span>{" "}
                        {formatDateTime(data.application.updatedAt)}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Checklist generated:</span>{" "}
                        {formatDateTime(data.application.checklistGeneratedAt)}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Checklist source:</span>{" "}
                        {data.application.checklistSource ?? "—"}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Documents:</span>{" "}
                        {data.uploadedDocuments.length}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Latest upload size:</span>{" "}
                        {formatBytes(data.uploadedDocuments[0]?.fileSize)}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid gap-6 lg:grid-cols-2">
                  <ReadOnlyDetailsCard
                    title="Application Details"
                    description="Core fields from `visa_application`."
	                    items={[
	                      { label: "Application ID", value: data.application.id },
	                      { label: "Name", value: data.application.name || "—" },
	                      { label: "Status", value: normalizeText(data.application.status) },
	                      { label: "Outcome date", value: formatDateTime(data.application.outcomeDate) },
	                    ]}
                  />
                  <ReadOnlyDetailsCard
                    title="Owner Details"
                    description="Core fields from owner `user`."
                    items={[
                      { label: "User ID", value: data.owner.id },
                      { label: "Name", value: ownerDisplayName },
                      { label: "Email", value: data.owner.email ?? "—" },
                      { label: "Role", value: data.owner.role },
                      { label: "Email verified", value: formatDateTime(data.owner.emailVerified) },
                    ]}
                  />
                </div>

                <ReadOnlyTableCard
                  title="Applicants"
                  count={data.applicants.length}
                  description="All applicant rows linked to this application."
                  rows={data.applicants}
                  columns={[
                    {
                      header: "Applicant",
                      render: (row) => (
                        <div>
                          <div className="font-medium">{row.name}</div>
                          <div className="font-mono text-xs text-muted-foreground">{row.id}</div>
                        </div>
                      ),
                    },
                    { header: "Relationship", render: (row) => normalizeText(row.relationship), className: "capitalize" },
                    { header: "Role", render: (row) => normalizeText(row.role), className: "capitalize" },
                    { header: "Linked User", render: (row) => formatUserReference(row.userId) },
                    { header: "Email", render: (row) => row.email ?? "—" },
                    { header: "Readiness", render: (row) => row.readinessScore ?? "—", className: "tabular-nums" },
                    { header: "Created", render: (row) => formatDateTime(row.createdAt), className: "tabular-nums" },
                  ]}
                />

                <ReadOnlyTableCard
                  title="Checklist Items"
                  count={data.checklistItems.length}
                  description="Checklist requirements and current status."
                  rows={data.checklistItems}
                  columns={[
                    {
                      header: "Document",
                      render: (row) => (
                        <div>
                          <div className="font-medium">{row.documentName}</div>
                          <div className="text-xs text-muted-foreground">{truncateText(row.description, 100)}</div>
                        </div>
                      ),
                    },
                    { header: "Applicant ID", render: (row) => row.applicantId ?? "—", className: "font-mono text-xs" },
                    {
                      header: "Required",
                      render: (row) => (
                        <Badge variant={row.isRequired ? "default" : "secondary"}>
                          {row.isRequired ? "Required" : "Optional"}
                        </Badge>
                      ),
                    },
                    {
                      header: "Status",
                      render: (row) => <Badge variant="outline">{normalizeText(row.status)}</Badge>,
                      className: "capitalize",
                    },
                    { header: "Sort", render: (row) => row.sortOrder, className: "tabular-nums" },
                    { header: "Updated", render: (row) => formatDateTime(row.updatedAt), className: "tabular-nums" },
                  ]}
                />

                <ReadOnlyTableCard
                  title="Uploaded Documents"
                  count={data.uploadedDocuments.length}
                  description="Stored files with extraction and indexing pipeline states."
                  rows={data.uploadedDocuments}
                  columns={[
                    {
                      header: "File",
                      render: (row) => (
                        <div>
                          <div className="font-medium">{row.fileName}</div>
                          <div className="font-mono text-xs text-muted-foreground">{row.id}</div>
                        </div>
                      ),
                    },
                    { header: "Checklist Item", render: (row) => row.checklistItemId ?? "—", className: "font-mono text-xs" },
                    { header: "Type", render: (row) => row.mimeType, className: "text-xs" },
                    { header: "Size", render: (row) => formatBytes(row.fileSize), className: "tabular-nums" },
                    { header: "Pages", render: (row) => row.pageCount ?? "—", className: "tabular-nums" },
                    {
                      header: "Extraction",
                      render: (row) => <Badge variant="outline">{normalizeText(row.extractionStatus)}</Badge>,
                      className: "capitalize",
                    },
                    {
                      header: "Indexing",
                      render: (row) => <Badge variant="outline">{normalizeText(row.indexingStatus)}</Badge>,
                      className: "capitalize",
                    },
                    { header: "Uploaded", render: (row) => formatDateTime(row.uploadedAt), className: "tabular-nums" },
                  ]}
                />

                <ReadOnlyTableCard
                  title="Evaluations"
                  count={data.evaluations.length}
                  description="Evaluation runs and aggregate scoring."
                  rows={data.evaluations}
                  columns={[
                    {
                      header: "Evaluation",
                      render: (row) => (
                        <div>
                          <div className="font-mono text-xs">{row.id}</div>
                          <div className="text-xs text-muted-foreground">{truncateText(row.summary, 90)}</div>
                        </div>
                      ),
                    },
                    { header: "Applicant ID", render: (row) => row.applicantId ?? "—", className: "font-mono text-xs" },
                    { header: "Score", render: (row) => row.overallScore, className: "tabular-nums font-medium" },
                    {
                      header: "Risk",
                      render: (row) => <Badge variant="outline">{normalizeText(row.riskLevel)}</Badge>,
                      className: "capitalize",
                    },
                    { header: "Red flags", render: (row) => row.redFlags?.length ?? 0, className: "tabular-nums" },
                    { header: "Created", render: (row) => formatDateTime(row.createdAt), className: "tabular-nums" },
                  ]}
                />

                <div className="grid gap-6 lg:grid-cols-2">
                  <ReadOnlyTableCard
                    title="Chat Conversations"
                    count={data.conversations.length}
                    description="Conversation sessions for Atlas chat."
                    rows={data.conversations}
                    columns={[
                      {
                        header: "Conversation",
                        render: (row) => (
                          <div>
                            <div className="font-medium">{row.name}</div>
                            <div className="font-mono text-xs text-muted-foreground">{row.id}</div>
                          </div>
                        ),
                      },
                      { header: "Created", render: (row) => formatDateTime(row.createdAt), className: "tabular-nums" },
                      { header: "Updated", render: (row) => formatDateTime(row.updatedAt), className: "tabular-nums" },
                    ]}
                  />
                  <ReadOnlyTableCard
                    title="Recent Chat Messages"
                    count={data.recentMessages.length}
                    description="Last 100 rows from `chat_message` (newest first)."
                    rows={data.recentMessages}
                    columns={[
                      {
                        header: "Message",
                        render: (row) => (
                          <div>
                            <div className="font-mono text-xs text-muted-foreground">{row.id}</div>
                            <div>{truncateText(row.content, 110)}</div>
                          </div>
                        ),
                      },
                      {
                        header: "Role",
                        render: (row) => <Badge variant="outline">{normalizeText(row.role)}</Badge>,
                        className: "capitalize",
                      },
                      { header: "Conversation", render: (row) => row.conversationId ?? "—", className: "font-mono text-xs" },
                      { header: "Created", render: (row) => formatDateTime(row.createdAt), className: "tabular-nums" },
                    ]}
                  />
                </div>

                <div className="grid gap-6 lg:grid-cols-3">
                  <ReadOnlyTableCard
                    title="Memberships"
                    count={data.memberships.length}
                    description="Workspace collaborators and role bindings."
                    rows={data.memberships}
                    columns={[
                      { header: "User", render: (row) => formatUserReference(row.userId) },
                      { header: "Role ID", render: (row) => row.roleId, className: "font-mono text-xs" },
                      { header: "System role", render: (row) => formatBoolean(row.isSystemRole) },
                      { header: "Active", render: (row) => formatBoolean(row.isActive) },
                      { header: "Invited by", render: (row) => formatUserReference(row.invitedBy) },
                      { header: "Joined", render: (row) => formatDateTime(row.joinedAt), className: "tabular-nums" },
                    ]}
                  />
                  <ReadOnlyTableCard
                    title="Roles"
                    count={data.roles.length}
                    description="Custom role definitions and permissions."
                    rows={data.roles}
                    columns={[
                      {
                        header: "Role",
                        render: (row) => (
                          <div>
                            <div className="font-medium">{row.name}</div>
                            <div className="font-mono text-xs text-muted-foreground">{row.id}</div>
                          </div>
                        ),
                      },
                      { header: "Editable", render: (row) => formatBoolean(row.isEditable) },
                      { header: "Permissions", render: (row) => row.permissions?.length ?? 0, className: "tabular-nums" },
                      { header: "Description", render: (row) => truncateText(row.description, 80) },
                    ]}
                  />
                  <ReadOnlyTableCard
                    title="Invitations"
                    count={data.invitations.length}
                    description="Pending and accepted invitations."
                    rows={data.invitations}
                    columns={[
                      { header: "Email", render: (row) => row.email },
                      { header: "Role ID", render: (row) => row.roleId, className: "font-mono text-xs" },
                      { header: "Invited by", render: (row) => formatUserReference(row.invitedBy) },
                      { header: "Accepted by", render: (row) => formatUserReference(row.acceptedBy) },
                      { header: "Accepted", render: (row) => (row.acceptedAt ? "Yes" : "No") },
                      { header: "Expires", render: (row) => formatDateTime(row.expiresAt), className: "tabular-nums" },
                    ]}
                  />
                </div>

	                <div className="grid gap-6 lg:grid-cols-2">
	                  <ReadOnlyTableCard
	                    title="Related User Lookup"
	                    count={data.relatedUsers.length}
	                    description="User records referenced by applicants, memberships, and invitations."
                    rows={data.relatedUsers}
                    columns={[
                      {
                        header: "User",
                        render: (row) => (
                          <div>
                            <div className="font-medium">{getUserDisplayName(row)}</div>
                            <div className="font-mono text-xs text-muted-foreground">{row.id}</div>
                          </div>
                        ),
                      },
                      { header: "Email", render: (row) => row.email ?? "—" },
                      { header: "Role", render: (row) => row.role, className: "capitalize" },
                      { header: "Verified", render: (row) => (row.emailVerified ? "Yes" : "No") },
                    ]}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
