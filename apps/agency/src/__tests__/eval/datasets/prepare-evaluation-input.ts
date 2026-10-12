import type { CaseEvaluationInput, EvaluationEvidence } from "@/services/case-evaluation";
import { sanitizeForPrompt } from "@/services/atlas-prompt";
import type { EvaluationInput } from "./evaluation-cases";

/** Supplies recorded evidence to the production core; extraction and retrieval are not measured. */
export function prepareEvaluationInput({ input }: { input: EvaluationInput }): CaseEvaluationInput {
  if (
    input.routeContext &&
    (input.routeContext.destinationCountry !== input.destinationCountry ||
      input.routeContext.visaType !== input.visaType)
  ) {
    throw new Error("Recorded route context does not match the case destination and visa type.");
  }
  const evidence: EvaluationEvidence = {
    docByChecklistItem: new Map(),
    textByDocId: new Map(),
    translatedTextByDocId: new Map(),
    relevantChunksByItemId: new Map(),
    visionDataByDocId: new Map(),
    metadataByDocId: new Map(),
  };
  for (const document of input.documents) {
    // A null text value in these fixtures means the required upload is absent.
    if (document.textContent === null) continue;
    const documentId = `recorded-${document.checklistItemId}`;
    evidence.docByChecklistItem.set(document.checklistItemId, {
      id: documentId,
      fileName: `${document.checklistItemId}.pdf`,
    });
    evidence.textByDocId.set(documentId, document.textContent);
    if (document.relevantChunks)
      evidence.relevantChunksByItemId.set(document.checklistItemId, document.relevantChunks);
    if (document.visionImages?.length)
      evidence.visionDataByDocId.set(documentId, document.visionImages);
  }
  return {
    asOfDate: input.asOfDate,
    routeContext: {
      ...input.routeContext,
      destinationCountry: input.destinationCountry,
      visaType: input.visaType,
      facts: {
        nationality: input.homeCountry,
        currentCountry: input.currentCountry ?? input.homeCountry,
        applicantName: input.applicantName ?? null,
        relationship: input.relationship ?? "primary",
        ...input.routeContext?.facts,
      },
    },
    checklistItems: input.documents.map((document) => ({
      id: document.checklistItemId,
      documentName: document.documentName,
      isRequired: document.isRequired,
      description:
        document.description ?? "Review this document against the stated route requirements.",
      commonMistakes: document.commonMistakes ?? null,
    })),
    evidence,
    applicationContext: `Visa type: ${input.visaType}
Applicant country (passport): ${input.homeCountry}
Currently residing in: ${input.currentCountry ?? input.homeCountry}
Destination country: ${input.destinationCountry}
Embassy: ${input.embassy ?? "Not supplied in recorded case"}
Applicant name: ${sanitizeForPrompt(input.applicantName ?? "Not supplied in recorded case", 200)} (${input.relationship ?? "primary"})`,
    visaType: input.visaType,
  };
}
