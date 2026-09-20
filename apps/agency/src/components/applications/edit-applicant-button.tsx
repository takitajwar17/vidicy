"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { PencilIcon, Loader2Icon, ChevronDownIcon, ChevronUpIcon, ExternalLinkIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { COUNTRIES, YEAR_OPTIONS } from "@/constants"
import { updateApplicantAction } from "@/actions/applicant.action"
import { useServerAction } from "zsa-react"
import Link from "next/link"

interface VisaHistoryData {
  approvedBefore: boolean | null
  approvedVisaType: string | null
  approvedYear: string | null
  rejectedBefore: boolean | null
  rejectedVisaType: string | null
  rejectedYear: string | null
  rejectedReason: string | null
}

interface EditApplicantButtonProps {
  applicationId: string
  applicantId: string
  applicantName: string
  isPrimary: boolean
  currentEmail: string | null
  currentNationality: string | null
  currentRelationship: string
  currentVisaHistory: VisaHistoryData
}

export function EditApplicantButton({
  applicationId,
  applicantId,
  applicantName,
  isPrimary,
  currentEmail,
  currentNationality,
  currentRelationship,
  currentVisaHistory,
}: EditApplicantButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  const [email, setEmail] = useState(currentEmail ?? "")
  const [nationality, setNationality] = useState(currentNationality ?? "")
  const [relationship, setRelationship] = useState(currentRelationship)
  const [approvedBefore, setApprovedBefore] = useState(currentVisaHistory.approvedBefore ?? false)
  const [approvedVisaType, setApprovedVisaType] = useState(currentVisaHistory.approvedVisaType ?? "")
  const [approvedYear, setApprovedYear] = useState(currentVisaHistory.approvedYear ?? "")
  const [rejectedBefore, setRejectedBefore] = useState(currentVisaHistory.rejectedBefore ?? false)
  const [rejectedVisaType, setRejectedVisaType] = useState(currentVisaHistory.rejectedVisaType ?? "")
  const [rejectedYear, setRejectedYear] = useState(currentVisaHistory.rejectedYear ?? "")
  const [rejectedReason, setRejectedReason] = useState(currentVisaHistory.rejectedReason ?? "")

  const { execute, isPending } = useServerAction(updateApplicantAction, {
    onSuccess: () => {
      toast.success("Applicant updated.")
      setOpen(false)
      router.refresh()
    },
    onError: ({ err }) => {
      toast.error(err.message ?? "Failed to update applicant.")
    },
  })

  function handleOpen(isOpen: boolean) {
    if (isOpen) {
      // Reset to current values on open
      setEmail(currentEmail ?? "")
      setNationality(currentNationality ?? "")
      setRelationship(currentRelationship)
      setApprovedBefore(currentVisaHistory.approvedBefore ?? false)
      setApprovedVisaType(currentVisaHistory.approvedVisaType ?? "")
      setApprovedYear(currentVisaHistory.approvedYear ?? "")
      setRejectedBefore(currentVisaHistory.rejectedBefore ?? false)
      setRejectedVisaType(currentVisaHistory.rejectedVisaType ?? "")
      setRejectedYear(currentVisaHistory.rejectedYear ?? "")
      setRejectedReason(currentVisaHistory.rejectedReason ?? "")
      setShowHistory(
        !!(currentVisaHistory.approvedBefore || currentVisaHistory.rejectedBefore)
      )
    }
    setOpen(isOpen)
  }

  function handleSave() {
    execute({
      applicationId,
      applicantId,
      email: email || undefined,
      nationality: nationality || undefined,
      relationship: isPrimary ? undefined : (relationship as "primary" | "spouse" | "child" | "parent" | "sibling" | "other"),
      approvedBefore,
      approvedVisaType: approvedBefore ? approvedVisaType || undefined : undefined,
      approvedYear: approvedBefore ? approvedYear || undefined : undefined,
      rejectedBefore,
      rejectedVisaType: rejectedBefore ? rejectedVisaType || undefined : undefined,
      rejectedYear: rejectedBefore ? rejectedYear || undefined : undefined,
      rejectedReason: rejectedBefore ? rejectedReason || undefined : undefined,
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title={`Edit ${applicantName}`}
        >
          <PencilIcon className="h-4 w-4" />
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {applicantName}</DialogTitle>
          <DialogDescription>
            Update contact details and visa history. Name changes require contacting support.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-email" className="text-sm">Email</Label>
            <Input
              id="edit-email"
              type="email"
              placeholder="e.g. person@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Providing an email gives this person portal access.
            </p>
          </div>

          {/* Nationality */}
          <div className="space-y-1.5">
            <Label className="text-sm">Nationality</Label>
            <SearchableSelect
              value={nationality}
              onChange={setNationality}
              options={COUNTRIES}
              placeholder="Select country"
              searchPlaceholder="Search countries…"
              disabled={isPending}
            />
          </div>

          {/* Relationship (hidden for primary) */}
          {!isPrimary && (
            <div className="space-y-1.5">
              <Label className="text-sm">Relationship</Label>
              <Select value={relationship} onValueChange={setRelationship}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="spouse">Spouse / Partner</SelectItem>
                  <SelectItem value="child">Child</SelectItem>
                  <SelectItem value="parent">Parent</SelectItem>
                  <SelectItem value="sibling">Sibling</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Visa history toggle */}
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showHistory ? <ChevronUpIcon className="h-3.5 w-3.5" /> : <ChevronDownIcon className="h-3.5 w-3.5" />}
            Visa history
          </button>

          {showHistory && (
            <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
              {/* Approved */}
              <div className="flex items-center justify-between">
                <Label className="text-xs">Previously approved?</Label>
                <Switch checked={approvedBefore} onCheckedChange={setApprovedBefore} />
              </div>
              {approvedBefore && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Visa type</Label>
                    <Input placeholder="e.g. B1/B2" value={approvedVisaType} onChange={(e) => setApprovedVisaType(e.target.value)} className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Year</Label>
                    <SearchableSelect
                      value={approvedYear}
                      onChange={setApprovedYear}
                      options={YEAR_OPTIONS}
                      placeholder="Year"
                      searchPlaceholder="Search years…"
                      disabled={isPending}
                      triggerClassName="h-8 text-xs"
                    />
                  </div>
                </div>
              )}

              {/* Rejected */}
              <div className="flex items-center justify-between">
                <Label className="text-xs">Previously rejected?</Label>
                <Switch checked={rejectedBefore} onCheckedChange={setRejectedBefore} />
              </div>
              {rejectedBefore && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Visa type</Label>
                      <Input placeholder="e.g. F-1" value={rejectedVisaType} onChange={(e) => setRejectedVisaType(e.target.value)} className="h-8 text-xs" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Year</Label>
                      <SearchableSelect
                        value={rejectedYear}
                        onChange={setRejectedYear}
                        options={YEAR_OPTIONS}
                        placeholder="Year"
                        searchPlaceholder="Search years…"
                        disabled={isPending}
                        triggerClassName="h-8 text-xs"
                      />
                    </div>
                  </div>
                  <Textarea
                    placeholder="Reason (optional)"
                    value={rejectedReason}
                    onChange={(e) => setRejectedReason(e.target.value)}
                    className="text-xs min-h-[56px] resize-none"
                    maxLength={500}
                  />
                </div>
              )}
            </div>
          )}

          {/* Support note */}
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            Need to change the name or other details?{" "}
            <Link
              href="/dashboard/support"
              className="underline underline-offset-2 hover:text-foreground inline-flex items-center gap-0.5"
            >
              Contact support
              <ExternalLinkIcon className="h-2.5 w-2.5" />
            </Link>
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? <><Loader2Icon className="h-4 w-4 animate-spin mr-1" />Saving…</> : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
