"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useServerAction } from "zsa-react";
import { toast } from "sonner";
import { saveRouteReviewAction } from "@/actions/route-review.action";
import { useCsrfToken } from "@/components/csrf-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { ROUTE_FACT_LABELS, type RouteReviewInput } from "@/lib/route-review-input";
import { DESTINATION_COUNTRIES, VISA_TYPES_BY_DESTINATION } from "@/lib/visa-route-catalog";
import { resolveReviewRoute } from "@/lib/review-rubric";
import styles from "./agency-case-workspace.module.css";

interface RouteReviewDetailsProps {
  applicationId: string;
  expectedHash: string;
  initialRoute: { destinationCountry: string; visaType: string };
  initial: Pick<RouteReviewInput, "stage" | "subtype" | "applicationDate" | "facts">;
  applicants: {
    id: string;
    name: string;
    nationality: string | null;
    dateOfBirth: string | null;
  }[];
}

export function RouteReviewDetails({
  applicationId,
  expectedHash,
  initialRoute,
  initial,
  applicants,
}: RouteReviewDetailsProps) {
  const csrfToken = useCsrfToken();
  const router = useRouter();
  const { execute, isPending } = useServerAction(saveRouteReviewAction);
  const [draft, setDraft] = useState(initial);
  const [selectedRoute, setSelectedRoute] = useState(initialRoute);
  const [revision, setRevision] = useState(expectedHash);
  const [people, setPeople] = useState(
    applicants.map((person) => ({
      id: person.id,
      nationality: person.nationality ?? "",
      dateOfBirth: person.dateOfBirth ?? "",
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const fields = [...new Set(resolveReviewRoute(selectedRoute).requiredFacts)].filter(
    (key) => !["stage", "subtype", "applicationDate", "nationality", "dateOfBirth"].includes(key),
  );
  const visaOptions = VISA_TYPES_BY_DESTINATION[selectedRoute.destinationCountry] ?? [];

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csrfToken) return;
    setError(null);
    const [saved, failure] = await execute({
      ...draft,
      ...selectedRoute,
      applicants: people,
      applicationId,
      expectedHash: revision,
      csrfToken,
    });
    if (failure) {
      setError(
        failure.message || "The details could not be saved. Your changes are still in this form.",
      );
      if (failure.code === "CONFLICT") router.refresh();
      return;
    }
    if (saved) {
      setRevision(saved.reviewContextHash);
      toast.success("Case details saved. Run review again for the current details.");
      router.refresh();
    }
  }

  return (
    <section aria-label="Case details for this route" className={styles.routeForm}>
      <div className={styles.formHeading}>
        <h3>Application details</h3>
        <p>Set the visa route and record the applicant details. Leave unknown fields blank.</p>
      </div>
      <form onSubmit={save} className="min-w-0">
        {revision !== expectedHash ? (
          <div role="status" className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <p>
              The case changed. Your draft is still here. Load the saved details before you make a
              new save.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => {
                setDraft(initial);
                setSelectedRoute(initialRoute);
                setPeople(
                  applicants.map((person) => ({
                    id: person.id,
                    nationality: person.nationality ?? "",
                    dateOfBirth: person.dateOfBirth ?? "",
                  })),
                );
                setRevision(expectedHash);
                setError(null);
              }}
            >
              Load saved details
            </Button>
          </div>
        ) : null}
        <fieldset className={styles.formSection}>
          <legend>Visa route</legend>
          <div className={styles.formFields}>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="route-destination">Destination</Label>
              <NativeSelect
                className="w-full min-w-0 max-w-full truncate"
                id="route-destination"
                value={selectedRoute.destinationCountry}
                onChange={(event) =>
                  setSelectedRoute({ destinationCountry: event.target.value, visaType: "" })
                }
              >
                {!DESTINATION_COUNTRIES.includes(selectedRoute.destinationCountry) ? (
                  <option value={selectedRoute.destinationCountry}>
                    {selectedRoute.destinationCountry}
                  </option>
                ) : null}
                {DESTINATION_COUNTRIES.map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="route-visa">Visa route</Label>
              <NativeSelect
                className="w-full min-w-0 max-w-full truncate"
                id="route-visa"
                value={selectedRoute.visaType}
                onChange={(event) =>
                  setSelectedRoute({ ...selectedRoute, visaType: event.target.value })
                }
              >
                <option value="">Select a visa route</option>
                {selectedRoute.visaType &&
                !visaOptions.some((option) => option.value === selectedRoute.visaType) ? (
                  <option value={selectedRoute.visaType}>
                    {selectedRoute.visaType} (exact route needed)
                  </option>
                ) : null}
                {visaOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="route-stage">Process stage</Label>
              <NativeSelect
                className="w-full min-w-0 max-w-full truncate"
                id="route-stage"
                value={draft.stage}
                onChange={(event) => setDraft({ ...draft, stage: event.target.value })}
              >
                <option value="">Not recorded</option>
                <option value="preparation">Preparing documents</option>
                <option value="profile">Profile or pool entry</option>
                <option value="invitation">After an invitation</option>
                <option value="application">Visa or permit application</option>
                <option value="status_change">Change of status</option>
                <option value="extension">Extension or renewal</option>
                <option value="decision">Awaiting a decision</option>
                <option value="entry">Travel and entry</option>
                <option value="post_entry">After entry</option>
              </NativeSelect>
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="route-subtype">Exact category or legal basis</Label>
              <Input
                id="route-subtype"
                maxLength={255}
                value={draft.subtype}
                onChange={(event) => setDraft({ ...draft, subtype: event.target.value })}
                placeholder="For example, Express Entry — CEC"
              />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="route-application-date">
                Application date or planned filing date
              </Label>
              <Input
                id="route-application-date"
                type="date"
                value={draft.applicationDate}
                onChange={(event) => setDraft({ ...draft, applicationDate: event.target.value })}
              />
            </div>
          </div>
        </fieldset>
        <fieldset className={styles.formSection}>
          <legend>Applicants</legend>
          <p className={styles.formHelp}>Use the nationality shown on each applicant's passport.</p>
          <div className="space-y-5">
            {applicants.map((person) => (
              <fieldset key={person.id} className={styles.applicantFields}>
                <legend className="mb-3 max-w-full break-words text-sm font-medium">
                  {person.name}
                </legend>
                <div className={styles.formFields}>
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor={`nationality-${person.id}`}>
                      Nationality / passport country
                    </Label>
                    <Input
                      id={`nationality-${person.id}`}
                      value={people.find((entry) => entry.id === person.id)?.nationality ?? ""}
                      maxLength={100}
                      onChange={(event) =>
                        setPeople(
                          people.map((current) =>
                            current.id === person.id
                              ? { ...current, nationality: event.target.value }
                              : current,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor={`dob-${person.id}`}>Date of birth</Label>
                    <Input
                      id={`dob-${person.id}`}
                      type="date"
                      value={people.find((entry) => entry.id === person.id)?.dateOfBirth ?? ""}
                      onChange={(event) =>
                        setPeople(
                          people.map((current) =>
                            current.id === person.id
                              ? { ...current, dateOfBirth: event.target.value }
                              : current,
                          ),
                        )
                      }
                    />
                  </div>
                </div>
              </fieldset>
            ))}
          </div>
        </fieldset>
        {fields.length ? (
          <fieldset className={styles.formSection}>
            <legend>Route-specific details</legend>
            <p className={styles.formHelp}>Additional facts for the selected visa route.</p>
            <div className={styles.formFields}>
              {fields.map((key) => (
                <div key={key} className="min-w-0 space-y-2">
                  <Label htmlFor={`route-fact-${key}`}>{ROUTE_FACT_LABELS[key] ?? key}</Label>
                  <Input
                    id={`route-fact-${key}`}
                    maxLength={2000}
                    value={draft.facts[key] ?? ""}
                    onChange={(event) =>
                      setDraft({ ...draft, facts: { ...draft.facts, [key]: event.target.value } })
                    }
                  />
                </div>
              ))}
            </div>
          </fieldset>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className={styles.formSave}>
          <p>Saving changes makes the previous review and client report out of date.</p>
          <Button
            type="submit"
            disabled={isPending || !csrfToken || !people.length || !selectedRoute.visaType}
          >
            {isPending ? "Saving…" : "Save case details"}
          </Button>
        </div>
      </form>
    </section>
  );
}
