"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { PlusIcon, Loader2Icon, ChevronDownIcon, ChevronUpIcon, CreditCardIcon, LockIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { COUNTRIES, PLAN_LIMIT_ERROR, YEAR_OPTIONS } from "@/constants"
import { createApplicantAction, checkApplicantQuotaAction } from "@/actions/applicant.action"
import { createAdditionalApplicantCheckoutAction } from "@/actions/payment.action"
import Link from "next/link"

interface AddApplicantButtonProps {
  applicationId: string
  compact?: boolean
  canManageBilling?: boolean
}

export function AddApplicantButton({
  applicationId,
  compact = false,
  canManageBilling = false,
}: AddApplicantButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [quotaLoading, setQuotaLoading] = useState(false)

  // Quota state
  const [quota, setQuota] = useState<{
    plan: string
    remaining: number
    requiresPayment: boolean
    currentCount: number
    paidApplicantCount: number
    isFreeTrial: boolean
  } | null>(null)

  const [name, setName] = useState("")
  const [relationship, setRelationship] = useState("")
  const [email, setEmail] = useState("")
  const [nationality, setNationality] = useState("")
  const [approvedBefore, setApprovedBefore] = useState(false)
  const [approvedVisaType, setApprovedVisaType] = useState("")
  const [approvedYear, setApprovedYear] = useState("")
  const [rejectedBefore, setRejectedBefore] = useState(false)
  const [rejectedVisaType, setRejectedVisaType] = useState("")
  const [rejectedYear, setRejectedYear] = useState("")
  const [rejectedReason, setRejectedReason] = useState("")

  function reset() {
    setName(""); setRelationship(""); setEmail(""); setNationality("")
    setApprovedBefore(false); setApprovedVisaType(""); setApprovedYear("")
    setRejectedBefore(false); setRejectedVisaType(""); setRejectedYear(""); setRejectedReason("")
    setShowHistory(false)
    setQuota(null)
  }

  // Check quota when dialog opens
  useEffect(() => {
    if (!open) return
    setQuotaLoading(true)
    checkApplicantQuotaAction({ applicationId })
      .then(([result]) => {
        if (result) setQuota(result)
      })
      .catch(() => { /* non-fatal */ })
      .finally(() => setQuotaLoading(false))
  }, [open, applicationId])

  async function handlePayForSlot() {
    setLoading(true)
    const [result, err] = await createAdditionalApplicantCheckoutAction({ applicationId })
    setLoading(false)
    if (err) {
      toast.error(err.message ?? "Failed to create payment session.")
      return
    }
    window.location.href = result.url
  }

  async function handleAdd() {
    if (!name.trim() || !relationship) return
    setLoading(true)
    const [, err] = await createApplicantAction({
      applicationId,
      name: name.trim(),
      relationship: relationship as "spouse" | "child" | "parent" | "sibling" | "other",
      email: email.trim() || undefined,
      nationality: nationality || undefined,
      approvedBefore: approvedBefore || undefined,
      approvedVisaType: approvedVisaType || undefined,
      approvedYear: approvedYear || undefined,
      rejectedBefore: rejectedBefore || undefined,
      rejectedVisaType: rejectedVisaType || undefined,
      rejectedYear: rejectedYear || undefined,
      rejectedReason: rejectedReason || undefined,
    })
    setLoading(false)
    if (err) {
      if (err.message === PLAN_LIMIT_ERROR) {
        toast.error("You've reached your plan limit. Pay $40 to add another applicant.")
        // Refresh quota
        checkApplicantQuotaAction({ applicationId }).then(([result]) => {
          if (result) setQuota(result)
        })
        return
      }
      toast.error("Failed to add applicant. Please try again.")
      return
    }
    toast.success("Applicant added.")
    reset()
    setOpen(false)
    router.refresh()
  }

  const trigger = compact ? (
    <button className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed px-2 py-2 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-muted/40 transition-colors">
      <PlusIcon className="h-3 w-3" />
      Add Applicant
    </button>
  ) : (
    <Button size="sm" variant="outline">
      <PlusIcon className="h-3.5 w-3.5" />
      Add Applicant
    </Button>
  )

  const planLabel = quota?.plan === "family" ? "Family" : quota?.plan === "custom" ? "Custom" : "Solo"

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!loading) { setOpen(v); if (!v) reset() } }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Applicant</DialogTitle>
          <DialogDescription>
            Add another person to this application — a spouse, child, or other dependent.
          </DialogDescription>
        </DialogHeader>

        {/* Quota banner */}
        {quota && !quotaLoading && (
          <div className={`rounded-lg border px-3 py-2 text-xs ${
            quota.requiresPayment
              ? "border-amber-500/30 bg-amber-500/5"
              : "border-status-success/30 bg-status-success/5"
          }`}>
            {quota.requiresPayment ? (
              <div className="space-y-2">
                {quota.isFreeTrial ? (
                  <>
                    <p className="font-medium text-amber-600 dark:text-amber-400">
                      Free trial — only 1 applicant included
                    </p>
                    <p className="text-muted-foreground">Unlock your application to add more applicants.</p>
                    <Button size="sm" variant="default" className="w-full" asChild>
                      <Link href={`/dashboard/${applicationId}/checkout`}>
                        <LockIcon className="h-3.5 w-3.5 mr-1.5" />
                        Unlock Application
                      </Link>
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="font-medium text-amber-600 dark:text-amber-400">
                      {planLabel} plan limit reached ({quota.currentCount}/{quota.paidApplicantCount} slots used)
                    </p>
                    {canManageBilling ? (
                      <>
                        <p className="text-muted-foreground">Adding another applicant costs $40 (one-time).</p>
                        <Button
                          size="sm"
                          variant="default"
                          className="w-full"
                          onClick={handlePayForSlot}
                          disabled={loading}
                        >
                          {loading ? (
                            <Loader2Icon className="h-3.5 w-3.5 animate-spin mr-1.5" />
                          ) : (
                            <CreditCardIcon className="h-3.5 w-3.5 mr-1.5" />
                          )}
                          Pay $40 to Add a Slot
                        </Button>
                      </>
                    ) : (
                      <p className="text-muted-foreground">
                        The application owner needs to purchase another seat before you can add more applicants.
                      </p>
                    )}
                  </>
                )}
              </div>
            ) : (
              <p className="text-status-success font-medium">
                {planLabel} plan — {quota.remaining} free slot{quota.remaining !== 1 ? "s" : ""} remaining ({quota.currentCount}/{quota.paidApplicantCount})
              </p>
            )}
          </div>
        )}

        {/* Only show form if there's a free slot */}
        {(!quota || !quota.requiresPayment) && (
          <>
            <div className="space-y-3">
              {/* Name */}
              <div className="space-y-1">
                <Label className="text-xs">Full Name <span className="text-destructive">*</span></Label>
                <Input placeholder="e.g. Sarah Chen" value={name} onChange={(e) => setName(e.target.value)} disabled={loading} className="h-9 text-sm" />
              </div>

              {/* Relationship */}
              <div className="space-y-1">
                <Label className="text-xs">Relationship <span className="text-destructive">*</span></Label>
                <Select value={relationship} onValueChange={setRelationship} disabled={loading}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="spouse">Spouse / Partner</SelectItem>
                    <SelectItem value="child">Child</SelectItem>
                    <SelectItem value="parent">Parent</SelectItem>
                    <SelectItem value="sibling">Sibling</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Nationality */}
              <div className="space-y-1">
                <Label className="text-xs">Nationality <span className="text-destructive">*</span></Label>
                <SearchableSelect
                  value={nationality}
                  onChange={setNationality}
                  options={COUNTRIES}
                  placeholder="Select country"
                  searchPlaceholder="Search countries…"
                  disabled={loading}
                />
              </div>

              {/* Email */}
              <div className="space-y-1">
                <Label className="text-xs">Email <span className="text-muted-foreground font-normal">(optional — gives portal access)</span></Label>
                <Input type="email" placeholder="e.g. sarah@example.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading} className="h-9 text-sm" />
              </div>

              {/* Previous visa history toggle */}
              <button
                type="button"
                onClick={() => setShowHistory(!showHistory)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors pt-1"
              >
                {showHistory ? <ChevronUpIcon className="h-3.5 w-3.5" /> : <ChevronDownIcon className="h-3.5 w-3.5" />}
                Previous visa history (optional)
              </button>

              {showHistory && (
                <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
                  {/* Approved before */}
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Previously approved for any visa?</Label>
                    <Switch checked={approvedBefore} onCheckedChange={setApprovedBefore} disabled={loading} />
                  </div>
                  {approvedBefore && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Visa type</Label>
                        <Input placeholder="e.g. B1/B2" value={approvedVisaType} onChange={(e) => setApprovedVisaType(e.target.value)} disabled={loading} className="h-8 text-xs" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Year</Label>
                        <SearchableSelect
                          value={approvedYear}
                          onChange={setApprovedYear}
                          options={YEAR_OPTIONS}
                          placeholder="Year"
                          searchPlaceholder="Search years…"
                          disabled={loading}
                          triggerClassName="h-8 text-xs"
                        />
                      </div>
                    </div>
                  )}

                  {/* Rejected before */}
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Previously rejected for any visa?</Label>
                    <Switch checked={rejectedBefore} onCheckedChange={setRejectedBefore} disabled={loading} />
                  </div>
                  {rejectedBefore && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Visa type</Label>
                          <Input placeholder="e.g. F-1" value={rejectedVisaType} onChange={(e) => setRejectedVisaType(e.target.value)} disabled={loading} className="h-8 text-xs" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Year</Label>
                          <SearchableSelect
                            value={rejectedYear}
                            onChange={setRejectedYear}
                            options={YEAR_OPTIONS}
                            placeholder="Year"
                            searchPlaceholder="Search years…"
                            disabled={loading}
                            triggerClassName="h-8 text-xs"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Reason <span className="text-muted-foreground font-normal">(optional)</span></Label>
                        <Textarea placeholder="Brief reason for rejection..." value={rejectedReason} onChange={(e) => setRejectedReason(e.target.value)} disabled={loading} className="text-xs min-h-[60px] resize-none" maxLength={500} />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => { setOpen(false); reset() }} disabled={loading}>Cancel</Button>
              <Button onClick={handleAdd} disabled={!name.trim() || !relationship || !nationality || loading}>
                {loading ? <Loader2Icon className="h-4 w-4 animate-spin" /> : "Add Applicant"}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* If payment required, show cancel button below the payment CTA */}
        {quota?.requiresPayment && (
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => { setOpen(false); reset() }} disabled={loading}>Cancel</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
