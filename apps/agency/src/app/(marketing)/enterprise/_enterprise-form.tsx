"use client"

import { useState } from "react"
import { useServerAction } from "zsa-react"
import { submitEnterpriseInquiryAction } from "@/actions/enterprise.action"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { CheckCircle2Icon, BuildingIcon, UsersIcon, ZapIcon, ShieldCheckIcon, HeadphonesIcon } from "lucide-react"
import Link from "next/link"

const PERKS = [
  { icon: UsersIcon,       label: "Unlimited applicants in one application" },
  { icon: BuildingIcon,    label: "Bulk application management dashboard" },
  { icon: ZapIcon,         label: "API access for workflow integrations" },
  { icon: ShieldCheckIcon, label: "White-label portal for your clients" },
  { icon: HeadphonesIcon,  label: "Dedicated account manager and SLA" },
]

export function EnterpriseForm() {
  const [submitted, setSubmitted] = useState(false)

  const [name, setName]               = useState("")
  const [email, setEmail]             = useState("")
  const [company, setCompany]         = useState("")
  const [website, setWebsite]         = useState("")
  const [role, setRole]               = useState("")
  const [teamSize, setTeamSize]       = useState("")
  const [monthlyVolume, setMonthlyVolume] = useState("")
  const [message, setMessage]         = useState("")

  const { execute, isPending } = useServerAction(submitEnterpriseInquiryAction, {
    onSuccess: () => setSubmitted(true),
    onError: ({ err }) => toast.error(err.message ?? "Something went wrong. Please try again."),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    execute({ name, email, company, website, role, teamSize, monthlyVolume, message })
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center gap-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-status-info/10 dark:bg-status-info/20">
          <CheckCircle2Icon className="h-8 w-8 text-status-info" />
        </div>
        <div className="space-y-2 max-w-sm">
          <h1 className="text-2xl font-semibold">We'll be in touch!</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Thanks for reaching out. We&apos;ll review your inquiry and get back to you within one business day.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-5 lg:gap-16">
      {/* Left — perks */}
      <div className="lg:col-span-2 space-y-5">
        <h2 className="font-semibold text-lg">What teams usually need</h2>
        <ul className="space-y-4">
          {PERKS.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <span className="text-sm text-muted-foreground leading-snug pt-1">{label}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground pt-2">
          Have a question before you reach out?{" "}
          <Link href="/dashboard/support" className="underline underline-offset-2 hover:text-foreground">
            Open a support ticket
          </Link>
        </p>
      </div>

      {/* Right — form */}
      <form onSubmit={handleSubmit} className="lg:col-span-3 space-y-5 rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Full name <span className="text-destructive">*</span></Label>
                <Input id="name" placeholder="Jane Smith" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Work email <span className="text-destructive">*</span></Label>
                <Input id="email" type="email" placeholder="jane@agency.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="company">Company / Agency <span className="text-destructive">*</span></Label>
                <Input id="company" placeholder="Acme Immigration Ltd." value={company} onChange={(e) => setCompany(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="website">Company website</Label>
                <Input id="website" type="url" placeholder="https://acme.com" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="role">Your role</Label>
                <Input id="role" placeholder="e.g. Operations Manager" value={role} onChange={(e) => setRole(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="teamSize">Team size</Label>
                <select
                  id="teamSize"
                  value={teamSize}
                  onChange={(e) => setTeamSize(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                >
                  <option value="" disabled>Select…</option>
                  <option value="1-5">1–5 people</option>
                  <option value="6-20">6–20 people</option>
                  <option value="21-50">21–50 people</option>
                  <option value="51-200">51–200 people</option>
                  <option value="200+">200+ people</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="monthlyVolume">Monthly applications</Label>
                <select
                  id="monthlyVolume"
                  value={monthlyVolume}
                  onChange={(e) => setMonthlyVolume(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                >
                  <option value="" disabled>Select…</option>
                  <option value="<10">Fewer than 10</option>
                  <option value="10-50">10–50</option>
                  <option value="51-200">51–200</option>
                  <option value="201-500">201–500</option>
                  <option value="500+">500+</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="message">Anything else we should know?</Label>
              <Textarea
                id="message"
                placeholder="Tell us about your workflow, the tools you use, or anything else we should know."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="min-h-[100px] resize-none"
                maxLength={3000}
              />
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={isPending}>
              {isPending ? "Sending…" : "Send Inquiry"}
            </Button>

            <p className="text-[11px] text-muted-foreground text-center">
              We usually respond within one business day. No spam.
            </p>
      </form>
    </div>
  )
}
