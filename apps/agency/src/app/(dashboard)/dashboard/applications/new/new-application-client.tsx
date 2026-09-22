"use client"

import { useState, useMemo, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import {
  Loader2Icon,
  CheckIcon,
  ChevronRightIcon,
  PlusIcon,
  Trash2Icon,
  UsersIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "lucide-react"
import { createVisaApplicationAction } from "@/actions/application.action"
import { createApplicantAction } from "@/actions/applicant.action"
import { COUNTRIES } from "@/constants"
import type { Route } from "next"

import {
  DESTINATION_COUNTRIES,
  STEPS,
  STORAGE_KEY,
  DEFAULT_FORM,
  YEAR_OPTIONS,
  emptyApplicant,
  getEmbassies,
  getVisaTypes,
  type FormData,
} from "./new-application-constants";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NewApplicationClient() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [animating, setAnimating] = useState(false)
  const [slideDir, setSlideDir] = useState<"left" | "right">("right")
  const [loading, setLoading] = useState(false)
  const activeStepRef = useRef<HTMLDivElement>(null)

  // Scroll active step into view whenever step changes
  useEffect(() => {
    activeStepRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" })
  }, [step])
  const [form, setForm] = useState<FormData>(DEFAULT_FORM)
  const [hasHydratedForm, setHasHydratedForm] = useState(false)
  const [showErrors, setShowErrors] = useState(false)

  // Hydration-safe localStorage restore: runs only on client after first paint.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setForm(JSON.parse(saved) as FormData)
    } catch {
      // Non-fatal: ignore malformed JSON and keep default form.
    } finally {
      setHasHydratedForm(true)
    }
  }, [])

  // Persist form state to localStorage only after initial restore completes.
  useEffect(() => {
    if (!hasHydratedForm) return
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(form)) } catch {}
  }, [form, hasHydratedForm])

  /** Current step's progress value (1-indexed for display) */
  const progress = ((step + 1) / STEPS.length) * 100

  /** Derived embassy list — recomputes when destination or current country changes */
  const embassyList = useMemo(
    () => getEmbassies(form.destinationCountry, form.currentCountry),
    [form.destinationCountry, form.currentCountry]
  )

  /** Derived visa types — recomputes when destination changes */
  const visaTypes = useMemo(
    () => getVisaTypes(form.destinationCountry),
    [form.destinationCountry]
  )

  /** Animated step transition */
  function goToStep(next: number) {
    setShowErrors(false)
    const dir = next > step ? "right" : "left"
    setSlideDir(dir)
    setAnimating(true)
    setTimeout(() => {
      setStep(next)
      setAnimating(false)
    }, 180)
  }

  /** Enter key advances the form */
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Enter") return
      // Don't intercept Enter inside textareas
      if ((e.target as HTMLElement).tagName === "TEXTAREA") return
      if (loading) return
      if (step < STEPS.length - 1 && canAdvance()) goToStep(step + 1)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, loading, form])

  /** Generic field updater */
  function updateField<K extends keyof FormData>(field: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  /**
   * Updating destination resets dependent downstream fields so the user
   * doesn't carry forward a stale visa type or embassy.
   */
  function updateDestination(value: string) {
    setForm((prev) => ({
      ...prev,
      destinationCountry: value,
      // Reset downstream fields that depend on destination
      visaType: "",
      embassy: "",
      useCustomEmbassy: false,
      customEmbassy: "",
    }))
  }

  /**
   * Updating currentCountry resets embassy choices since the available
   * embassies are determined by the (destination × currentCountry) pair.
   */
  function updateCurrentCountry(value: string) {
    setForm((prev) => ({
      ...prev,
      currentCountry: value,
      // Reset embassy since it depends on where the user is applying from
      embassy: "",
      useCustomEmbassy: false,
      customEmbassy: "",
    }))
  }

  /**
   * The effective embassy value passed to the server action.
   * When no curated list exists (embassyList === null), the freetext input is shown
   * automatically without setting useCustomEmbassy=true, so we must check embassyList
   * here too — otherwise resolvedEmbassy falls back to the always-empty form.embassy
   * and Zod rejects the submission with a min(1) error.
   */
  const resolvedEmbassy = (!embassyList || form.useCustomEmbassy) ? form.customEmbassy.trim() : form.embassy
  const setupSummary = [
    { label: "Passport", value: form.homeCountry },
    { label: "Applying from", value: form.currentCountry },
    { label: "Destination", value: form.destinationCountry },
    { label: "Visa", value: form.visaType },
    { label: "Embassy", value: resolvedEmbassy },
  ]
  const continueLabel =
    step === 0 ? "Continue to trip details" :
    step === 1 ? "Continue to embassy" :
    step === 2 ? "Continue to history" :
    step === 3 ? "Continue to applicants" :
    step === 4 ? "Continue to review" :
    "Continue"

  /** Whether the current step has enough data to continue */
  function canAdvance(): boolean {
    if (step === 0) return !!form.homeCountry && !!form.currentCountry
    if (step === 1) return !!form.destinationCountry && !!form.visaType
    if (step === 2) {
      if (!embassyList || form.useCustomEmbassy) return form.customEmbassy.trim().length > 0
      return !!form.embassy
    }
    if (step === 3) return true // history is optional
    if (step === 4) {
      // All additional applicants must have name, relationship, and nationality
      return form.additionalApplicants.every(
        (a) => a.name.trim() && a.relationship && a.nationality
      )
    }
    return true
  }

  /** Attempt to advance — shows inline errors if validation fails */
  function handleContinue() {
    if (!canAdvance()) {
      setShowErrors(true)
      return
    }
    setShowErrors(false)
    goToStep(step + 1)
  }

  async function handleSubmit() {
    setLoading(true)
    try {
      const previousApplicationStatus =
        form.approvedBefore && form.rejectedBefore ? "previously_rejected" :
        form.approvedBefore  ? "previously_approved" :
        form.rejectedBefore  ? "previously_rejected" :
        "first_time"

      const [result, appErr] = await createVisaApplicationAction({
        homeCountry: form.homeCountry,
        currentCountry: form.currentCountry,
        destinationCountry: form.destinationCountry,
        visaType: form.visaType,
        embassy: resolvedEmbassy,
        previousApplicationStatus,
        approvedBefore:    form.approvedBefore,
        approvedVisaType:  form.approvedVisaType  || undefined,
        approvedYear:      form.approvedYear      || undefined,
        rejectedBefore:    form.rejectedBefore,
        rejectedVisaType:  form.rejectedVisaType  || undefined,
        rejectedYear:      form.rejectedYear      || undefined,
        rejectedReason:    form.rejectedReason    || undefined,
      })

      if (appErr || !result) {
        toast.error("Failed to create application. Please try again.")
        setLoading(false)
        return
      }

      // Create additional applicants in sequence.
      // If one fails, surface it immediately and route to the created app so the
      // user can recover from the Members screen without creating duplicate apps.
      for (const a of form.additionalApplicants) {
        const [, applicantErr] = await createApplicantAction({
          applicationId: result.application.id,
          name: a.name.trim(),
          relationship: a.relationship as "spouse" | "child" | "parent" | "sibling" | "other",
          email: a.email.trim() || undefined,
          nationality: a.nationality || undefined,
          approvedBefore: a.approvedBefore || undefined,
          approvedVisaType: a.approvedVisaType || undefined,
          approvedYear: a.approvedYear || undefined,
          rejectedBefore: a.rejectedBefore || undefined,
          rejectedVisaType: a.rejectedVisaType || undefined,
          rejectedYear: a.rejectedYear || undefined,
          rejectedReason: a.rejectedReason || undefined,
        })

        if (applicantErr) {
          const applicantName = a.name.trim() || "an applicant"
          toast.error(
            `Application created, but we couldn't add ${applicantName}. You can add them from Members.`
          )
          try { localStorage.removeItem(STORAGE_KEY) } catch {}
          router.push(`/dashboard/${result.application.id}/members` as Route)
          return
        }
      }

      try { localStorage.removeItem(STORAGE_KEY) } catch {}
      // Free trial apps skip checkout and go directly to the workspace
      if (result.isFreeTrialApp) {
        router.push(`/dashboard/${result.application.id}/checklist` as Route)
      } else {
        router.push(`/dashboard/${result.application.id}/checkout` as Route)
      }
    } catch (e) {
      console.error(e)
      toast.error("Something went wrong. Please try again.")
      setLoading(false)
    }
  }

  return (
    <>
      <PageHeader
        items={[
          { href: "/dashboard", label: "Dashboard" },
          { href: "/dashboard/applications", label: "My Applications" },
          { href: "/dashboard/applications/new", label: "New Application" },
        ]}
      />

      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-1 flex-col items-center justify-center gap-6 py-4 md:py-6 px-4 lg:px-6">
          <div className="w-full max-w-lg space-y-6">

            {/* ----------------------------------------------------------------
                Stepper — named labels instead of "Step N of N"
            ---------------------------------------------------------------- */}
            <div className="space-y-3">
              {/* Named step labels */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
                {STEPS.map((s, i) => (
                  <div key={i} className="flex items-center gap-1 shrink-0" ref={i === step ? activeStepRef : undefined}>
                    <div className={cn(
                      "flex items-center gap-1.5 text-xs font-medium transition-colors",
                      i < step  ? "text-muted-foreground" :
                      i === step ? "text-foreground" :
                                   "text-muted-foreground/40"
                    )}>
                      {/* Step bubble */}
                      <span className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-2xs font-semibold border transition-colors",
                        i < step  ? "bg-primary/20 border-primary/40 text-primary" :
                        i === step ? "bg-primary border-primary text-primary-foreground" :
                                     "bg-muted border-border text-muted-foreground/40"
                      )}>
                        {i < step ? <CheckIcon className="h-2.5 w-2.5" /> : i + 1}
                      </span>
                      <span className={cn("hidden sm:inline", i !== step && i > step && "hidden")}>{s.label}</span>
                    </div>
                    {/* Connector line */}
                    {i < STEPS.length - 1 && (
                      <div className={cn("h-px w-4 transition-colors shrink-0", i < step ? "bg-primary/40" : "bg-border")} />
                    )}
                  </div>
                ))}
              </div>
              <Progress value={progress} className="h-1" />
            </div>

            <div className="flex flex-wrap gap-2">
              {setupSummary.map(({ label, value }) => (
                <div
                  key={label}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs transition-colors",
                    value
                      ? "border-primary/20 bg-primary/5 text-foreground"
                      : "border-border bg-muted/30 text-muted-foreground"
                  )}
                >
                  <span className="font-medium">{label}</span>
                  <span className="ml-1.5 opacity-80">{value || "Not set"}</span>
                </div>
              ))}
            </div>

            {/* ----------------------------------------------------------------
                Step card
            ---------------------------------------------------------------- */}
            <div
              className={cn(
                "transition-all duration-180",
                animating && slideDir === "right" && "opacity-0 translate-x-2",
                animating && slideDir === "left"  && "opacity-0 -translate-x-2",
                !animating && "opacity-100 translate-x-0"
              )}
            >
            <Card className="bg-gradient-to-t from-primary/5 to-card shadow-xs">
              <CardHeader>
                <CardTitle className="text-2xl font-semibold">{STEPS[step].title}</CardTitle>
                <CardDescription className="text-sm">{STEPS[step].description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">

                {/* ── Step 1: Passport & Residence ──────────────────────────── */}
                {step === 0 && (
                  <>
                    <div className="space-y-2">
                      <Label>Passport Nationality <span className="text-destructive">*</span></Label>
                      <SearchableSelect
                        value={form.homeCountry}
                        onChange={(v) => updateField("homeCountry", v)}
                        options={COUNTRIES}
                        placeholder="Select your passport country"
                        searchPlaceholder="Search countries…"
                      />
                      {showErrors && !form.homeCountry && (
                        <p className="text-xs text-destructive">Please select your passport country</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Country You Are Currently Residing In <span className="text-destructive">*</span></Label>
                      <SearchableSelect
                        value={form.currentCountry}
                        onChange={updateCurrentCountry}
                        options={COUNTRIES}
                        placeholder="Where are you located right now?"
                        searchPlaceholder="Search countries…"
                      />
                      {showErrors && !form.currentCountry ? (
                        <p className="text-xs text-destructive">Please select your current country</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          This determines which embassy you&#39;ll apply through.
                        </p>
                      )}
                    </div>
                  </>
                )}

                {/* ── Step 2: Travel Details ─────────────────────────────────── */}
                {step === 1 && (
                  <>
                    <div className="space-y-2">
                      <Label>Destination Country <span className="text-destructive">*</span></Label>
                      <SearchableSelect
                        value={form.destinationCountry}
                        onChange={updateDestination}
                        options={DESTINATION_COUNTRIES}
                        placeholder="Select visa destination"
                        searchPlaceholder="Search destinations…"
                      />
                      {showErrors && !form.destinationCountry && (
                        <p className="text-xs text-destructive">Please select a destination</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Visa Type <span className="text-destructive">*</span></Label>
                      <SearchableSelect
                        value={form.visaType}
                        onChange={(v) => updateField("visaType", v)}
                        options={visaTypes}
                        placeholder={form.destinationCountry ? "Select visa category" : "Select a destination first"}
                        searchPlaceholder="Search visa types…"
                        disabled={!form.destinationCountry}
                      />
                      {showErrors && !form.visaType ? (
                        <p className="text-xs text-destructive">Please select a visa type</p>
                      ) : form.destinationCountry ? (
                        <p className="text-xs text-muted-foreground">
                          Showing visa categories specific to {form.destinationCountry}.
                        </p>
                      ) : null}
                    </div>
                  </>
                )}

                {/* ── Step 3: Where You'll Apply ─────────────────────────────── */}
                {step === 2 && (
                  <div className="space-y-3">
                    {!form.useCustomEmbassy && embassyList ? (
                      /* Curated embassy dropdown */
                      <div className="space-y-2">
                        <Label>Embassy / Consulate <span className="text-destructive">*</span></Label>
                        <SearchableSelect
                          value={form.embassy}
                          onChange={(v) => updateField("embassy", v)}
                          options={embassyList}
                          placeholder="Select your embassy"
                          searchPlaceholder="Search embassies…"
                        />
                        {showErrors && !form.embassy ? (
                          <p className="text-xs text-destructive">Please select an embassy</p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Showing {form.destinationCountry} embassies in {form.currentCountry}.
                          </p>
                        )}
                        {/* Fallback toggle */}
                        <button
                          type="button"
                          className="text-xs text-primary underline-offset-4 hover:underline"
                          onClick={() => updateField("useCustomEmbassy", true)}
                        >
                          Can't find your embassy?
                        </button>
                      </div>
                    ) : (
                      /* Freetext fallback */
                      <div className="space-y-2">
                        <Label>Embassy / Consulate Location <span className="text-destructive">*</span></Label>
                        <Input
                          placeholder="e.g. U.S. Embassy Dhaka, British High Commission New Delhi"
                          value={form.customEmbassy}
                          onChange={(e) => updateField("customEmbassy", e.target.value)}
                          autoFocus
                        />
                        {showErrors && !form.customEmbassy.trim() ? (
                          <p className="text-xs text-destructive">Please enter the embassy or consulate name</p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Enter the full name of the embassy or consulate you will apply through.
                          </p>
                        )}
                        {/* Offer to go back to list if one exists */}
                        {embassyList && (
                          <button
                            type="button"
                            className="text-xs text-primary underline-offset-4 hover:underline"
                            onClick={() => {
                              updateField("useCustomEmbassy", false)
                              updateField("customEmbassy", "")
                            }}
                          >
                            Choose from list
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Step 4: Application History ────────────────────────────── */}
                {step === 3 && (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground -mt-1">
                      Select all that apply for <span className="font-medium text-foreground">{form.destinationCountry}</span>.
                    </p>

                    {/* Previously approved card */}
                    <div className={cn(
                      "rounded-lg border transition-colors",
                      form.approvedBefore ? "border-primary bg-primary/5" : "border-border"
                    )}>
                      <button
                        type="button"
                        onClick={() => updateField("approvedBefore", !form.approvedBefore)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left"
                      >
                        <span className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors",
                          form.approvedBefore ? "border-primary bg-primary" : "border-muted-foreground/40"
                        )}>
                          {form.approvedBefore && <CheckIcon className="h-2.5 w-2.5 text-white" />}
                        </span>
                        <div>
                          <p className="text-sm font-medium leading-none">Previously approved</p>
                          <p className="mt-1 text-xs text-muted-foreground">I have received a {form.destinationCountry} visa before</p>
                        </div>
                      </button>
                      {form.approvedBefore && (
                        <div className="px-4 pb-4 pt-1 grid grid-cols-2 gap-3 border-t">
                          <div className="space-y-1.5">
                            <Label className="text-xs">Visa type <span className="text-muted-foreground">(optional)</span></Label>
                            <SearchableSelect
                              value={form.approvedVisaType}
                              onChange={(v) => updateField("approvedVisaType", v)}
                              options={visaTypes}
                              placeholder="Select type"
                              searchPlaceholder="Search…"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Year <span className="text-muted-foreground">(optional)</span></Label>
                            <SearchableSelect
                              value={form.approvedYear}
                              onChange={(v) => updateField("approvedYear", v)}
                              options={YEAR_OPTIONS}
                              placeholder="Year"
                              searchPlaceholder="Search years…"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Previously rejected card */}
                    <div className={cn(
                      "rounded-lg border transition-colors",
                      form.rejectedBefore ? "border-destructive/60 bg-destructive/5" : "border-border"
                    )}>
                      <button
                        type="button"
                        onClick={() => updateField("rejectedBefore", !form.rejectedBefore)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left"
                      >
                        <span className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors",
                          form.rejectedBefore ? "border-destructive bg-destructive" : "border-muted-foreground/40"
                        )}>
                          {form.rejectedBefore && <CheckIcon className="h-2.5 w-2.5 text-white" />}
                        </span>
                        <div>
                          <p className="text-sm font-medium leading-none">Previously rejected</p>
                          <p className="mt-1 text-xs text-muted-foreground">A {form.destinationCountry} application was refused or denied</p>
                        </div>
                      </button>
                      {form.rejectedBefore && (
                        <div className="px-4 pb-4 pt-1 space-y-3 border-t">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <Label className="text-xs">Visa type <span className="text-muted-foreground">(optional)</span></Label>
                              <SearchableSelect
                                value={form.rejectedVisaType}
                                onChange={(v) => updateField("rejectedVisaType", v)}
                                options={visaTypes}
                                placeholder="Select type"
                                searchPlaceholder="Search…"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs">Year <span className="text-muted-foreground">(optional)</span></Label>
                              <SearchableSelect
                                value={form.rejectedYear}
                                onChange={(v) => updateField("rejectedYear", v)}
                                options={YEAR_OPTIONS}
                                placeholder="Year"
                                searchPlaceholder="Search years…"
                              />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Reason given <span className="text-muted-foreground">(optional)</span></Label>
                            <Textarea
                              placeholder="e.g. Insufficient financial documentation, ties to home country…"
                              rows={2}
                              className="text-sm resize-none"
                              value={form.rejectedReason}
                              onChange={(e) => updateField("rejectedReason", e.target.value)}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {!form.approvedBefore && !form.rejectedBefore && (
                      <p className="text-xs text-muted-foreground text-center pt-1">
                        Neither applies? Leave both unchecked — we'll treat this as your first application.
                      </p>
                    )}
                  </div>
                )}

                {/* ── Step 5: People ───────────────────────────────────────── */}
                {step === 4 && (
                  <div className="space-y-4">
                    {/* Primary person summary (read-only) */}
                    <div className="rounded-lg border bg-muted/30 px-4 py-3 flex items-center gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <UsersIcon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">You (Primary Applicant)</p>
                        <p className="text-xs text-muted-foreground truncate">{form.homeCountry}</p>
                      </div>
                      <span className="ml-auto text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">$79</span>
                    </div>

                    {/* Additional applicants */}
                    {form.additionalApplicants.map((applicant, idx) => (
                      <div key={idx} className="rounded-lg border space-y-3 p-4">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">Person {idx + 2}</p>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">$40</span>
                            <button
                              type="button"
                              onClick={() => setForm((prev) => ({
                                ...prev,
                                additionalApplicants: prev.additionalApplicants.filter((_, i) => i !== idx),
                              }))}
                              className="text-muted-foreground hover:text-destructive transition-colors"
                            >
                              <Trash2Icon className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        {showErrors && (!applicant.name.trim() || !applicant.relationship || !applicant.nationality) && (
                          <p className="text-xs text-destructive rounded-md bg-destructive/10 px-3 py-1.5">Please fill in all required fields (name, relationship, nationality)</p>
                        )}
                        {/* Name */}
                        <div className="space-y-1">
                          <Label className="text-xs">Full Name <span className="text-destructive">*</span></Label>
                          <Input
                            placeholder="e.g. Sarah Chen"
                            value={applicant.name}
                            onChange={(e) => setForm((prev) => {
                              const updated = [...prev.additionalApplicants]
                              updated[idx] = { ...updated[idx], name: e.target.value }
                              return { ...prev, additionalApplicants: updated }
                            })}
                            className="h-10 sm:h-9 text-sm"
                          />
                        </div>

                        {/* Relationship + Nationality row */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Relationship <span className="text-destructive">*</span></Label>
                            <Select
                              value={applicant.relationship}
                              onValueChange={(v) => setForm((prev) => {
                                const updated = [...prev.additionalApplicants]
                                updated[idx] = { ...updated[idx], relationship: v }
                                return { ...prev, additionalApplicants: updated }
                              })}
                            >
                              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="spouse">Spouse / Partner</SelectItem>
                                <SelectItem value="child">Child</SelectItem>
                                <SelectItem value="parent">Parent</SelectItem>
                                <SelectItem value="sibling">Sibling</SelectItem>
                                <SelectItem value="other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Nationality <span className="text-destructive">*</span></Label>
                            <SearchableSelect
                              value={applicant.nationality}
                              onChange={(v) => setForm((prev) => {
                                const updated = [...prev.additionalApplicants]
                                updated[idx] = { ...updated[idx], nationality: v }
                                return { ...prev, additionalApplicants: updated }
                              })}
                              options={COUNTRIES}
                              placeholder="Country…"
                              searchPlaceholder="Search…"
                            />
                          </div>
                        </div>

                        {/* Email */}
                        <div className="space-y-1">
                          <Label className="text-xs">Email <span className="text-muted-foreground font-normal">(optional — gives portal access)</span></Label>
                          <Input
                            type="email"
                            placeholder="e.g. sarah@example.com"
                            value={applicant.email}
                            onChange={(e) => setForm((prev) => {
                              const updated = [...prev.additionalApplicants]
                              updated[idx] = { ...updated[idx], email: e.target.value }
                              return { ...prev, additionalApplicants: updated }
                            })}
                            className="h-9 text-sm"
                          />
                        </div>

                        {/* Visa history toggle */}
                        <button
                          type="button"
                          onClick={() => setForm((prev) => {
                            const updated = [...prev.additionalApplicants]
                            updated[idx] = { ...updated[idx], showHistory: !updated[idx].showHistory }
                            return { ...prev, additionalApplicants: updated }
                          })}
                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {applicant.showHistory ? <ChevronUpIcon className="h-3.5 w-3.5" /> : <ChevronDownIcon className="h-3.5 w-3.5" />}
                          Previous visa history (optional)
                        </button>

                        {applicant.showHistory && (
                          <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
                            {/* Approved */}
                            <div className="flex items-center justify-between">
                              <Label className="text-xs">Previously approved for any visa?</Label>
                              <Switch
                                checked={applicant.approvedBefore}
                                onCheckedChange={(v) => setForm((prev) => {
                                  const updated = [...prev.additionalApplicants]
                                  updated[idx] = { ...updated[idx], approvedBefore: v }
                                  return { ...prev, additionalApplicants: updated }
                                })}
                              />
                            </div>
                            {applicant.approvedBefore && (
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <Label className="text-xs">Visa type</Label>
                                  <Input placeholder="e.g. B1/B2" value={applicant.approvedVisaType}
                                    onChange={(e) => setForm((prev) => { const u = [...prev.additionalApplicants]; u[idx] = { ...u[idx], approvedVisaType: e.target.value }; return { ...prev, additionalApplicants: u } })}
                                    className="h-8 text-xs" />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">Year</Label>
                                  <SearchableSelect
                                    value={applicant.approvedYear}
                                    onChange={(v) => setForm((prev) => { const u = [...prev.additionalApplicants]; u[idx] = { ...u[idx], approvedYear: v }; return { ...prev, additionalApplicants: u } })}
                                    options={YEAR_OPTIONS}
                                    placeholder="Year"
                                    searchPlaceholder="Search years…"
                                    triggerClassName="h-8 text-xs"
                                  />
                                </div>
                              </div>
                            )}
                            {/* Rejected */}
                            <div className="flex items-center justify-between">
                              <Label className="text-xs">Previously rejected for any visa?</Label>
                              <Switch
                                checked={applicant.rejectedBefore}
                                onCheckedChange={(v) => setForm((prev) => {
                                  const updated = [...prev.additionalApplicants]
                                  updated[idx] = { ...updated[idx], rejectedBefore: v }
                                  return { ...prev, additionalApplicants: updated }
                                })}
                              />
                            </div>
                            {applicant.rejectedBefore && (
                              <div className="space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <Label className="text-xs">Visa type</Label>
                                    <Input placeholder="e.g. F-1" value={applicant.rejectedVisaType}
                                      onChange={(e) => setForm((prev) => { const u = [...prev.additionalApplicants]; u[idx] = { ...u[idx], rejectedVisaType: e.target.value }; return { ...prev, additionalApplicants: u } })}
                                      className="h-8 text-xs" />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">Year</Label>
                                    <SearchableSelect
                                      value={applicant.rejectedYear}
                                      onChange={(v) => setForm((prev) => { const u = [...prev.additionalApplicants]; u[idx] = { ...u[idx], rejectedYear: v }; return { ...prev, additionalApplicants: u } })}
                                      options={YEAR_OPTIONS}
                                      placeholder="Year"
                                      searchPlaceholder="Search years…"
                                      triggerClassName="h-8 text-xs"
                                    />
                                  </div>
                                </div>
                                <Textarea placeholder="Reason (optional)" value={applicant.rejectedReason}
                                  onChange={(e) => setForm((prev) => { const u = [...prev.additionalApplicants]; u[idx] = { ...u[idx], rejectedReason: e.target.value }; return { ...prev, additionalApplicants: u } })}
                                  className="text-xs min-h-[56px] resize-none" maxLength={500} />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Add person button */}
                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({
                        ...prev,
                        additionalApplicants: [...prev.additionalApplicants, emptyApplicant()],
                      }))}
                      className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-muted/30 transition-colors"
                    >
                      <PlusIcon className="h-4 w-4" />
                      Add another person
                      <span className="text-xs text-muted-foreground ml-1">+$40 each</span>
                    </button>

                    {/* Price summary — always visible */}
                    <div className="rounded-lg bg-muted/40 border px-4 py-3 flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {form.additionalApplicants.length > 0
                          ? `${1 + form.additionalApplicants.length} people · $79 + ${form.additionalApplicants.length} × $40`
                          : "1 person · Base price"}
                      </span>
                      <span className="font-semibold">
                        ${79 + form.additionalApplicants.length * 40}
                      </span>
                    </div>
                  </div>
                )}

                {/* ── Step 6: Review ───────────────────────────────────────── */}
                {step === 5 && (
                  <div className="space-y-4">
                    {/* Route pill */}
                    <div className="flex items-center justify-center gap-2 flex-wrap">
                      <span className="rounded-full bg-muted px-3 py-1 text-sm font-medium">{form.homeCountry}</span>
                      <ChevronRightIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="rounded-full bg-primary/10 text-primary px-3 py-1 text-sm font-semibold">{form.destinationCountry}</span>
                    </div>

                    {/* Key details */}
                    <div className="divide-y rounded-lg border overflow-hidden">
                      {[
                        { label: "Visa type",     value: form.visaType },
                        { label: "Embassy",       value: resolvedEmbassy },
                        { label: "Applying from", value: form.currentCountry },
                        { label: "Applicants",    value: `${1 + form.additionalApplicants.length} person${form.additionalApplicants.length > 0 ? "s" : ""}` },
                        { label: "Total",         value: `$${79 + form.additionalApplicants.length * 40}` },
                      ].map(({ label, value }) => (
                        <div key={label} className="flex items-center justify-between px-4 py-2.5 bg-muted/30 text-sm">
                          <span className="text-muted-foreground shrink-0">{label}</span>
                          <span className="font-medium text-right ml-4 truncate max-w-[60%]">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </CardContent>
            </Card>
            </div>

            {/* ----------------------------------------------------------------
                Navigation buttons
            ---------------------------------------------------------------- */}
            <div className="flex gap-3">
              {step > 0 && !loading && (
                <Button variant="outline" className="h-10 flex-1" onClick={() => goToStep(step - 1)}>
                  Back
                </Button>
              )}
              {step < STEPS.length - 1 ? (
                <Button
                  className="h-10 flex-1"
                  onClick={handleContinue}
                >
                  {continueLabel}
                  <ChevronRightIcon className="ml-1 h-4 w-4" />
                </Button>
              ) : (
                <Button className="h-10 flex-1" disabled={loading} onClick={handleSubmit}>
                  {loading ? (
                    <>
                      <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                      Creating…
                    </>
                  ) : (
                    <>
                      <CheckIcon className="mr-2 h-4 w-4" />
                      Create Application
                    </>
                  )}
                </Button>
              )}
            </div>

          </div>
        </div>
      </div>
    </>
  )
}
