import React from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DocumentUpload } from "@/components/visa/document-upload"
import { DeleteDocumentButton } from "@/components/visa/delete-document-button"
import { SetDocumentActiveButton } from "@/components/visa/set-document-active-button"
import { ChecklistGenerator } from "@/components/visa/checklist-generator"
import { DocumentPreviewDrawer } from "@/components/visa/document-preview-drawer"
import { AddCustomChecklistItem } from "@/components/visa/add-custom-checklist-item"
import {
  CheckCircle2Icon,
  ClockIcon,
  AlertTriangleIcon,
  ExternalLinkIcon,
  ChevronDownIcon,
  WifiIcon,
  BrainCircuitIcon,
} from "lucide-react"
import type { ChecklistItem } from "@/db/schema"

type ChecklistUploadedDocument = {
  id: string
  checklistItemId: string | null
  fileName: string
  fileSize: number
  mimeType: string
  uploadedAt: Date
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending: <ClockIcon className="h-4 w-4 text-muted-foreground" />,
  uploaded: <CheckCircle2Icon className="h-4 w-4 text-primary" />,
  approved: <CheckCircle2Icon className="h-4 w-4 text-primary" />,
  rejected: <AlertTriangleIcon className="h-4 w-4 text-destructive" />,
}

interface ChecklistStepProps {
  appId: string
  selectedApplicant: { id: string; name: string }
  requiredItems: ChecklistItem[]
  optionalItems: ChecklistItem[]
  docsByChecklistItem: Map<string, ChecklistUploadedDocument[]>
  hasChecklist: boolean
  researchSource?: string
  researchGeneratedAt?: number
  researchCitations: string[]
}

export function ChecklistStep({
  appId,
  selectedApplicant,
  requiredItems,
  optionalItems,
  docsByChecklistItem,
  hasChecklist,
  researchSource,
  researchGeneratedAt,
  researchCitations,
}: ChecklistStepProps) {
  return (
    <>
      {!hasChecklist ? (
        <Card className="shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Document Checklist</CardTitle>
            <CardDescription>Your tailored list of required and optional documents.</CardDescription>
          </CardHeader>
          <CardContent className="pb-10">
            <ChecklistGenerator
              applicationId={appId}
              applicantId={selectedApplicant.id}
              applicantName={selectedApplicant.name}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <CardTitle className="text-base">Required Documents</CardTitle>
                  <CardDescription>Upload these first to improve readiness faster.</CardDescription>
                </div>
                {researchSource && (
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {(researchSource === "live_search" || researchSource === "cached") && (
                      <Badge variant="outline" className="text-xs gap-1 text-status-success border-status-success/30 bg-status-success/5">
                        <WifiIcon className="h-3 w-3" />
                        Live embassy data
                        {researchGeneratedAt && (
                          <span className="text-muted-foreground ml-1">
                            · {new Date(researchGeneratedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                          </span>
                        )}
                      </Badge>
                    )}
                    {researchSource === "model_knowledge" && (
                      <Badge variant="outline" className="text-xs gap-1 text-status-warning border-status-warning/30 bg-status-warning/5">
                        <BrainCircuitIcon className="h-3 w-3" />
                        AI knowledge — verify with embassy
                      </Badge>
                    )}
                  </div>
                )}
              </div>
              {researchCitations.length > 0 && (
                <details className="group mt-2">
                  <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 list-none">
                    <ExternalLinkIcon className="h-3 w-3 shrink-0" />
                    <span>{researchCitations.length} official source{researchCitations.length !== 1 ? "s" : ""}</span>
                    <ChevronDownIcon className="h-3 w-3 ml-auto transition-transform group-open:rotate-180" />
                  </summary>
                  <ul className="mt-2 space-y-1 pl-4">
                    {researchCitations.map((url, i) => (
                      <li key={i}>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline break-all flex items-center gap-1"
                        >
                          <ExternalLinkIcon className="h-3 w-3 shrink-0" />
                          {url}
                        </a>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
                {requiredItems.map((item) => {
                  const itemDocs = docsByChecklistItem.get(item.id) ?? []
                  return (
                    <Card key={item.id} className="border shadow-none transition-colors hover:bg-muted/40">
                    <CardContent className="py-4">
                      <div className="flex items-start gap-3">
                        <div className="relative top-0.5 h-6 shrink-0 flex items-center">{STATUS_ICON[item.status] ?? STATUS_ICON.pending}</div>
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium">{item.documentName}</p>
                            <Badge variant="secondary" className="text-xs">Required</Badge>
                            {item.status !== "pending" && (
                              <Badge
                                variant="outline"
                                className={`text-xs capitalize ${
                                  item.status === "uploaded" || item.status === "approved"
                                    ? "text-primary border-primary/30"
                                    : "text-destructive border-destructive/30"
                                }`}
                              >
                                {item.status}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{item.description}</p>
                          {item.commonMistakes && (
                            <details className="group">
                              <summary className="cursor-pointer text-xs text-accent-foreground hover:text-foreground flex items-center gap-1">
                                <AlertTriangleIcon className="h-3 w-3" />
                                Common mistakes
                              </summary>
                              <p className="mt-1 text-xs text-muted-foreground pl-4">{item.commonMistakes}</p>
                            </details>
                          )}
                          {itemDocs.length > 0 && (
                            <div className="mt-2 rounded-lg border bg-muted/30 p-2 space-y-1.5">
                              {itemDocs.map((doc, docIdx) => {
                                const isActive = docIdx === 0
                                return (
                                  <DocumentPreviewDrawer
                                    key={doc.id}
                                    documentId={doc.id}
                                    fileName={doc.fileName}
                                    fileSize={doc.fileSize}
                                    mimeType={doc.mimeType}
                                    uploadedAt={new Date(doc.uploadedAt)}
                                    isActive={isActive}
                                    hasMultipleVersions={itemDocs.length > 1}
                                    sectionLabel={item.documentName}
                                  >
                                    {!isActive && (
                                      <SetDocumentActiveButton documentId={doc.id} applicationId={appId} />
                                    )}
                                    <DeleteDocumentButton documentId={doc.id} applicationId={appId} fileName={doc.fileName} />
                                  </DocumentPreviewDrawer>
                                )
                              })}
                            </div>
                          )}
                          {/* Upload button below content on mobile, hidden here on sm+ (shows in right column) */}
                          <div className="sm:hidden pt-1">
                            <DocumentUpload
                              applicationId={appId}
                              applicantId={selectedApplicant.id}
                              checklistItemId={item.id}
                            />
                          </div>
                        </div>
                        <div className="hidden sm:block shrink-0">
                          <DocumentUpload
                            applicationId={appId}
                            applicantId={selectedApplicant.id}
                            checklistItemId={item.id}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </CardContent>
          </Card>

          {optionalItems.length > 0 && (
            <details className="group rounded-lg border bg-card p-4 shadow-xs">
              <summary className="cursor-pointer text-sm font-medium list-none flex items-center justify-between">
                Optional Documents
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {optionalItems.length} item{optionalItems.length !== 1 ? "s" : ""}
                  </span>
                  <ChevronDownIcon className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
                </div>
              </summary>
              <div className="space-y-3 mt-4">
                {optionalItems.map((item) => {
                  const itemDocs = docsByChecklistItem.get(item.id) ?? []
                  return (
                    <Card key={item.id} className="border shadow-none transition-colors hover:bg-muted/40">
                      <CardContent className="py-4">
                        <div className="flex items-start gap-3">
                          <div className="relative top-0.5 h-6 shrink-0 flex items-center">{STATUS_ICON[item.status] ?? STATUS_ICON.pending}</div>
                          <div className="flex-1 min-w-0 space-y-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium">{item.documentName}</p>
                              <Badge variant="outline" className="text-xs">Optional</Badge>
                              {item.status !== "pending" && (
                                <Badge
                                  variant="outline"
                                  className={`text-xs capitalize ${
                                    item.status === "uploaded" || item.status === "approved"
                                      ? "text-primary border-primary/30"
                                      : "text-destructive border-destructive/30"
                                  }`}
                                >
                                  {item.status}
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">{item.description}</p>
                            {itemDocs.length > 0 && (
                              <div className="mt-2 rounded-lg border bg-muted/30 p-2 space-y-1.5">
                                {itemDocs.map((doc, docIdx) => {
                                  const isActive = docIdx === 0
                                  return (
                                    <DocumentPreviewDrawer
                                      key={doc.id}
                                      documentId={doc.id}
                                      fileName={doc.fileName}
                                      fileSize={doc.fileSize}
                                      mimeType={doc.mimeType}
                                      uploadedAt={new Date(doc.uploadedAt)}
                                      isActive={isActive}
                                      hasMultipleVersions={itemDocs.length > 1}
                                      sectionLabel={item.documentName}
                                    >
                                      {!isActive && (
                                        <SetDocumentActiveButton documentId={doc.id} applicationId={appId} />
                                      )}
                                      <DeleteDocumentButton documentId={doc.id} applicationId={appId} fileName={doc.fileName} />
                                    </DocumentPreviewDrawer>
                                  )
                                })}
                              </div>
                            )}
                            {/* Upload button below content on mobile, hidden here on sm+ */}
                            <div className="sm:hidden pt-1">
                              <DocumentUpload
                                applicationId={appId}
                                applicantId={selectedApplicant.id}
                                checklistItemId={item.id}
                              />
                            </div>
                          </div>
                          <div className="hidden sm:block shrink-0">
                            <DocumentUpload
                              applicationId={appId}
                              applicantId={selectedApplicant.id}
                              checklistItemId={item.id}
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </details>
          )}
        </>
      )}
      {/* Add custom document — only shown once the AI checklist has been generated */}
      {hasChecklist && (
        <div className="flex justify-end pt-1">
          <AddCustomChecklistItem
            applicationId={appId}
            applicantId={selectedApplicant.id}
          />
        </div>
      )}
    </>
  )
}
