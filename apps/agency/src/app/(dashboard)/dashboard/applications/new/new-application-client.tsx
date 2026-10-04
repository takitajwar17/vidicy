"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useServerAction } from "zsa-react";
import { toast } from "sonner";
import { CalendarIcon, Loader2Icon, PlusIcon } from "lucide-react";

import { createAgencyCaseAction } from "@/actions/agency-case.action";
import { AgencyPageShell } from "@/components/agency/agency-page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AGENCY_CASE_PRIORITY } from "@/db/schema";
import { COUNTRIES } from "@/constants";
import { CASE_PRIORITY_META } from "@/lib/agency-workflow";
import { cn } from "@/lib/utils";
import { DESTINATION_COUNTRIES, YEAR_OPTIONS, getEmbassies, getVisaTypes } from "./new-application-constants";

interface StaffOption {
  userId: string;
  label: string;
}

interface NewApplicationClientProps {
  staff: StaffOption[];
}

interface IntakeForm {
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  applicantName: string;
  applicantEmail: string;
  homeCountry: string;
  currentCountry: string;
  destinationCountry: string;
  visaType: string;
  embassy: string;
  customEmbassy: string;
  priority: string;
  assignedReviewerId: string;
  submittedAt: string;
  dueAt: string;
  approvedBefore: boolean;
  approvedVisaType: string;
  approvedYear: string;
  rejectedBefore: boolean;
  rejectedVisaType: string;
  rejectedYear: string;
  rejectedReason: string;
}

const DEFAULT_FORM: IntakeForm = {
  clientName: "",
  clientEmail: "",
  clientPhone: "",
  applicantName: "",
  applicantEmail: "",
  homeCountry: "",
  currentCountry: "",
  destinationCountry: "",
  visaType: "",
  embassy: "",
  customEmbassy: "",
  priority: AGENCY_CASE_PRIORITY.NORMAL,
  assignedReviewerId: "",
  submittedAt: new Date().toISOString().slice(0, 10),
  dueAt: "",
  approvedBefore: false,
  approvedVisaType: "",
  approvedYear: "",
  rejectedBefore: false,
  rejectedVisaType: "",
  rejectedYear: "",
  rejectedReason: "",
};

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label className="text-xs font-bold text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export function NewApplicationClient({ staff }: NewApplicationClientProps) {
  const router = useRouter();
  const [form, setForm] = useState<IntakeForm>(DEFAULT_FORM);
  const { execute, isPending } = useServerAction(createAgencyCaseAction);

  const visaTypes = useMemo(
    () => getVisaTypes(form.destinationCountry),
    [form.destinationCountry],
  );
  const embassyList = useMemo(
    () => getEmbassies(form.destinationCountry, form.currentCountry),
    [form.destinationCountry, form.currentCountry],
  );
  const resolvedEmbassy = embassyList ? form.embassy : form.customEmbassy.trim();

  function update<K extends keyof IntakeForm>(key: K, value: IntakeForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateDestination(value: string) {
    setForm((current) => ({
      ...current,
      destinationCountry: value,
      visaType: "",
      embassy: "",
      customEmbassy: "",
    }));
  }

  function updateCurrentCountry(value: string) {
    setForm((current) => ({
      ...current,
      currentCountry: value,
      embassy: "",
      customEmbassy: "",
    }));
  }

  function updateApprovedBefore(value: boolean) {
    setForm((current) => ({
      ...current,
      approvedBefore: value,
      approvedVisaType: value ? current.approvedVisaType : "",
      approvedYear: value ? current.approvedYear : "",
    }));
  }

  function updateRejectedBefore(value: boolean) {
    setForm((current) => ({
      ...current,
      rejectedBefore: value,
      rejectedVisaType: value ? current.rejectedVisaType : "",
      rejectedYear: value ? current.rejectedYear : "",
      rejectedReason: value ? current.rejectedReason : "",
    }));
  }

  function validate() {
    const required = [
      form.clientName,
      form.applicantName,
      form.homeCountry,
      form.currentCountry,
      form.destinationCountry,
      form.visaType,
      resolvedEmbassy,
    ];
    return required.every((value) => value.trim().length > 0);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!validate()) {
      toast.error("Complete the client, applicant, route, visa type, and embassy fields.");
      return;
    }

    const [result, error] = await execute({
      clientName: form.clientName.trim(),
      clientEmail: form.clientEmail.trim(),
      clientPhone: form.clientPhone.trim(),
      applicantName: form.applicantName.trim(),
      applicantEmail: form.applicantEmail.trim(),
      homeCountry: form.homeCountry,
      currentCountry: form.currentCountry,
      destinationCountry: form.destinationCountry,
      visaType: form.visaType,
      embassy: resolvedEmbassy,
      priority: form.priority as (typeof AGENCY_CASE_PRIORITY)[keyof typeof AGENCY_CASE_PRIORITY],
      assignedReviewerId: form.assignedReviewerId,
      submittedAt: form.submittedAt,
      dueAt: form.dueAt,
      approvedBefore: form.approvedBefore,
      approvedVisaType: form.approvedBefore ? form.approvedVisaType.trim() : "",
      approvedYear: form.approvedBefore ? form.approvedYear : "",
      rejectedBefore: form.rejectedBefore,
      rejectedVisaType: form.rejectedBefore ? form.rejectedVisaType.trim() : "",
      rejectedYear: form.rejectedBefore ? form.rejectedYear : "",
      rejectedReason: form.rejectedBefore ? form.rejectedReason.trim() : "",
    });

    if (error || !result) {
      toast.error(error?.message ?? "Could not create client file.");
      return;
    }

    toast.success("Client file added to the agency queue.");
    router.push(`/dashboard/${result.application.id}` as Route);
  }

  return (
    <AgencyPageShell
      breadcrumbs={[
        { href: "/dashboard", label: "Dashboard" },
        { href: "/dashboard/applications", label: "Applications" },
        { href: "/dashboard/applications/new", label: "New client file" },
      ]}
      title="New client file"
      description="Add the client, applicant, route, reviewer, and dates before documents arrive."
    >
      <form onSubmit={handleSubmit} className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card className="rounded-xl shadow-[var(--shadow-dashboard)]">
            <CardHeader>
              <CardTitle className="text-base">Who sent the file</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Field label="Client name">
                <Input value={form.clientName} onChange={(event) => update("clientName", event.target.value)} placeholder="Global Visa Co." />
              </Field>
              <Field label="Client email">
                <Input type="email" value={form.clientEmail} onChange={(event) => update("clientEmail", event.target.value)} placeholder="client@example.com" />
              </Field>
              <Field label="Client phone">
                <Input value={form.clientPhone} onChange={(event) => update("clientPhone", event.target.value)} placeholder="+1 555 0100" />
              </Field>
              <Field label="Applicant name">
                <Input value={form.applicantName} onChange={(event) => update("applicantName", event.target.value)} placeholder="Rahul Mehta" />
              </Field>
              <Field label="Applicant email">
                <Input type="email" value={form.applicantEmail} onChange={(event) => update("applicantEmail", event.target.value)} placeholder="applicant@example.com" />
              </Field>
              <Field label="Passport country">
                <SearchableSelect
                  value={form.homeCountry}
                  onChange={(value) => update("homeCountry", value)}
                  options={COUNTRIES}
                  placeholder="Select country"
                  triggerClassName="h-10 rounded-lg bg-background/95"
                />
              </Field>
            </CardContent>
          </Card>

          <Card className="rounded-xl shadow-[var(--shadow-dashboard)]">
            <CardHeader>
              <CardTitle className="text-base">Route and reviewer</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Field label="Applying from">
                <SearchableSelect
                  value={form.currentCountry}
                  onChange={updateCurrentCountry}
                  options={COUNTRIES}
                  placeholder="Select country"
                  triggerClassName="h-10 rounded-lg bg-background/95"
                />
              </Field>
              <Field label="Destination">
                <SearchableSelect
                  value={form.destinationCountry}
                  onChange={updateDestination}
                  options={DESTINATION_COUNTRIES}
                  placeholder="Select destination"
                  triggerClassName="h-10 rounded-lg bg-background/95"
                />
              </Field>
              <Field label="Visa type">
                <SearchableSelect
                  value={form.visaType}
                  onChange={(value) => update("visaType", value)}
                  options={visaTypes}
                  placeholder="Select visa type"
                  disabled={!form.destinationCountry}
                  triggerClassName="h-10 rounded-lg bg-background/95"
                />
              </Field>
              {embassyList ? (
                <Field label="Submission post">
                  <SearchableSelect
                    value={form.embassy}
                    onChange={(value) => update("embassy", value)}
                    options={embassyList}
                    placeholder="Select embassy or consulate"
                    disabled={!form.destinationCountry || !form.currentCountry}
                    triggerClassName="h-10 rounded-lg bg-background/95"
                  />
                </Field>
              ) : (
                <Field label="Submission post">
                  <Input
                    value={form.customEmbassy}
                    onChange={(event) => update("customEmbassy", event.target.value)}
                    placeholder="Embassy or consulate"
                    disabled={!form.destinationCountry || !form.currentCountry}
                  />
                </Field>
              )}
              <Field label="Priority">
                <Select value={form.priority} onValueChange={(value) => update("priority", value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(AGENCY_CASE_PRIORITY).map((priority) => (
                      <SelectItem key={priority} value={priority}>
                        {CASE_PRIORITY_META[priority].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Reviewer">
                <Select value={form.assignedReviewerId || "unassigned"} onValueChange={(value) => update("assignedReviewerId", value === "unassigned" ? "" : value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Assign reviewer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {staff.map((member) => (
                      <SelectItem key={member.userId} value={member.userId}>
                        {member.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </CardContent>
          </Card>

          <Card className="rounded-xl shadow-[var(--shadow-dashboard)]">
            <CardHeader>
              <CardTitle className="text-base">Prior visa history</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5 xl:grid-cols-2">
              <div className="space-y-4 rounded-xl border border-border/70 bg-muted/30 p-4">
                <div className="flex items-center justify-between gap-4">
                  <Label className="text-sm font-bold">Previously approved</Label>
                  <Switch checked={form.approvedBefore} onCheckedChange={updateApprovedBefore} />
                </div>
                {form.approvedBefore ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input value={form.approvedVisaType} onChange={(event) => update("approvedVisaType", event.target.value)} placeholder="Visa type" />
                    <Select value={form.approvedYear} onValueChange={(value) => update("approvedYear", value)}>
                      <SelectTrigger><SelectValue placeholder="Year" /></SelectTrigger>
                      <SelectContent>{YEAR_OPTIONS.map((year) => <SelectItem key={year} value={year}>{year}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>
              <div className="space-y-4 rounded-xl border border-border/70 bg-muted/30 p-4">
                <div className="flex items-center justify-between gap-4">
                  <Label className="text-sm font-bold">Previously refused</Label>
                  <Switch checked={form.rejectedBefore} onCheckedChange={updateRejectedBefore} />
                </div>
                {form.rejectedBefore ? (
                  <div className="grid gap-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input value={form.rejectedVisaType} onChange={(event) => update("rejectedVisaType", event.target.value)} placeholder="Visa type" />
                      <Select value={form.rejectedYear} onValueChange={(value) => update("rejectedYear", value)}>
                        <SelectTrigger><SelectValue placeholder="Year" /></SelectTrigger>
                        <SelectContent>{YEAR_OPTIONS.map((year) => <SelectItem key={year} value={year}>{year}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <Textarea value={form.rejectedReason} onChange={(event) => update("rejectedReason", event.target.value)} placeholder="Refusal reason, refusal letter note, or reviewer context" />
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card className="sticky top-20 rounded-xl shadow-[var(--shadow-dashboard)]">
            <CardHeader>
              <CardTitle className="text-base">Dates for the queue</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Received date">
                <div className="relative">
                  <CalendarIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input type="date" value={form.submittedAt} onChange={(event) => update("submittedAt", event.target.value)} className="pl-9" />
                </div>
              </Field>
              <Field label="Internal due date">
                <div className="relative">
                  <CalendarIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input type="date" value={form.dueAt} onChange={(event) => update("dueAt", event.target.value)} className="pl-9" />
                </div>
              </Field>
              <div className="rounded-xl border border-border/70 bg-muted/35 p-4 text-sm text-muted-foreground">
                <p className="font-semibold text-foreground">Starts in intake</p>
                <p className="mt-1">
                  Every active staff member can see the case. The assigned reviewer owns the file once documents arrive.
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <PlusIcon className="h-4 w-4" />}
                Create client file
              </Button>
            </CardContent>
          </Card>
        </aside>
      </form>
    </AgencyPageShell>
  );
}
