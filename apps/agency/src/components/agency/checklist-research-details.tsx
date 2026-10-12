import "server-only";

import { ExternalLinkIcon } from "lucide-react";
import {
  getChecklistResearchDetails,
  type ChecklistResearchDetailsInput,
} from "@/lib/checklist-research";
import { ChecklistResearchRefresh } from "./checklist-research-refresh";
import { ChecklistSourcesDialog } from "./checklist-sources-dialog";

const requirementLabels = {
  required: "Required",
  recommended: "Recommended",
  conditional: "Conditional",
  unknown: "Requirement not specified",
};
const applicabilityLabels = {
  applies: "Applies to this case",
  does_not_apply: "Does not apply",
  unknown: "Applicability not determined",
};

type ResearchDetails = ReturnType<typeof getChecklistResearchDetails>;

function sourceDate(value: string, includeTime = false) {
  return (
    new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      ...(includeTime ? { timeStyle: "short" as const } : {}),
      timeZone: "UTC",
    }).format(new Date(value)) + (includeTime ? " UTC" : "")
  );
}

export function ChecklistSourceEvidence({
  records,
  unreadableVersions,
}: Pick<ResearchDetails, "records" | "unreadableVersions">) {
  return (
    <div className="space-y-8">
      {records.map((record, index) => (
        <section key={`${record.generatedAt}-${index}`}>
          <div className="border-b border-border pb-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">
                {index === 0 ? "Latest sources" : "Earlier sources"}
              </h3>
              <time dateTime={record.generatedAt} className="text-xs text-muted-foreground">
                {sourceDate(record.generatedAt, true)}
              </time>
            </div>
            {record.route ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {record.route.destinationCountry} · {record.route.visaType}
              </p>
            ) : null}
            <p className="mt-2 text-xs text-muted-foreground">
              {record.source === "model_knowledge"
                ? "General guidance; no web sources were retrieved."
                : record.source === "cached"
                  ? "Saved search results."
                  : "Web search results."}
              {record.retrievedAt ? ` Retrieved ${sourceDate(record.retrievedAt, true)}.` : ""}
            </p>
          </div>
          <ul className="divide-y divide-border">
            {record.candidates.map((candidate) => (
              <li key={candidate.checklistItemId} className="py-5 first:pt-4 last:pb-0">
                <h4 className="text-sm font-semibold leading-relaxed">{candidate.documentName}</h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  {requirementLabels[candidate.requirement]} ·{" "}
                  {applicabilityLabels[candidate.applicability]}
                </p>
                {candidate.condition ? (
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {candidate.condition}
                  </p>
                ) : null}
                {!candidate.sources.length ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    No source link was saved for this item.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-4">
                    {candidate.sources.map((source, sourceIndex) => (
                      <li
                        key={`${source.url}-${sourceIndex}`}
                        className="space-y-2 text-sm leading-relaxed"
                      >
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={source.url}
                          className="inline-flex max-w-full items-center gap-1.5 break-all text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {new URL(source.url).hostname}
                          <ExternalLinkIcon className="size-3 shrink-0" />
                        </a>
                        <p>{source.claim}</p>
                        {source.quotation ? (
                          <blockquote className="border-l-2 border-border pl-3 text-muted-foreground">
                            “{source.quotation}”
                          </blockquote>
                        ) : null}
                        {source.scope || source.effectiveDate ? (
                          <p className="text-xs text-muted-foreground">
                            {source.scope ? `Scope: ${source.scope}` : ""}
                            {source.scope && source.effectiveDate ? " · " : ""}
                            {source.effectiveDate
                              ? `Reported effective date: ${source.effectiveDate}`
                              : ""}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {unreadableVersions > 0 ? (
        <p className="text-xs text-muted-foreground">
          Some earlier source records cannot be shown. They remain saved in the case.
        </p>
      ) : null}
    </div>
  );
}

export function ChecklistResearchDetails({
  application,
  applicants,
}: Pick<ChecklistResearchDetailsInput, "application" | "applicants">) {
  const now = new Date();
  return (
    <section
      aria-label="Checklist sources"
      className="min-w-0 overflow-x-auto border-t border-border py-2"
    >
      <div className="flex min-w-max items-center gap-3">
        <h2 className="shrink-0 text-xs font-semibold">Checklist sources</h2>
        <div className="flex-1 space-y-2">
          {applicants.map((person) => {
            const details = getChecklistResearchDetails({
              application,
              applicants,
              applicantId: person.id,
              now,
            });
            const latest = details.records[0];
            return (
              <div key={person.id} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {applicants.length > 1 ? (
                    <h3 className="whitespace-nowrap text-xs font-medium">{person.name}</h3>
                  ) : null}
                  <p className="whitespace-nowrap text-xs text-muted-foreground">
                    {latest ? (
                      <>
                        Checked{" "}
                        <time dateTime={latest.retrievedAt ?? latest.generatedAt}>
                          {sourceDate(latest.retrievedAt ?? latest.generatedAt)}
                        </time>
                      </>
                    ) : (
                      "No saved checklist sources"
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {latest || details.unreadableVersions ? (
                    <ChecklistSourcesDialog
                      applicantName={applicants.length > 1 ? person.name : undefined}
                    >
                      <ChecklistSourceEvidence
                        records={details.records}
                        unreadableVersions={details.unreadableVersions}
                      />
                    </ChecklistSourcesDialog>
                  ) : null}
                  <ChecklistResearchRefresh
                    applicationId={application.id}
                    applicantId={person.id}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
