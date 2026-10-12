import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { ZSAError } from "zsa";
import type { getDB } from "@/db";
import { applicantTable, visaApplicationTable } from "@/db/schema";
import { routeReviewInputSchema } from "@/lib/route-review-input";
import { resolveReviewRoute } from "@/lib/review-rubric";
import { getAgencyReviewInvalidationQueries } from "@/server/agency-review";
import { loadReviewSnapshot } from "@/server/review-context";

export async function saveRouteReviewSettings({
  db,
  agencyId,
  input,
}: {
  db: ReturnType<typeof getDB>;
  agencyId: string;
  input: unknown;
}) {
  const draft = routeReviewInputSchema.parse(input);
  return db.withTransaction(async () => {
    const locked =
      await db.execute(sql`SELECT ${visaApplicationTable.id} FROM ${visaApplicationTable}
      WHERE ${visaApplicationTable.id} = ${draft.applicationId}
      AND ${visaApplicationTable.agencyId} = ${agencyId}
      AND ${visaApplicationTable.trashedAt} IS NULL FOR UPDATE`);
    if (!locked.rows.length) throw new ZSAError("NOT_FOUND", "Case not found.");
    const snapshot = await loadReviewSnapshot({ db, applicationId: draft.applicationId });
    if (!snapshot.application.clientId) throw new ZSAError("NOT_FOUND", "Case not found.");
    if (snapshot.reviewContextHash !== draft.expectedHash)
      throw new ZSAError(
        "CONFLICT",
        "The case changed. Reload the case before you save these details. Keep a copy of your changes.",
      );
    const selected = {
      destinationCountry: draft.destinationCountry ?? snapshot.application.destinationCountry,
      visaType: draft.visaType ?? snapshot.application.visaType,
    };
    if (
      (selected.destinationCountry !== snapshot.application.destinationCountry ||
        selected.visaType !== snapshot.application.visaType) &&
      resolveReviewRoute(selected).status === "unresolved"
    )
      throw new ZSAError("INPUT_PARSE_ERROR", "Select the exact destination and visa route.");
    if (
      draft.applicants.length !== snapshot.applicants.length ||
      new Set(draft.applicants.map((person) => person.id)).size !== draft.applicants.length ||
      draft.applicants.some(
        (person) => !snapshot.applicants.some((current) => current.id === person.id),
      )
    ) {
      throw new ZSAError("INPUT_PARSE_ERROR", "The applicant list does not match this case.");
    }
    let settings: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(snapshot.application.settings);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        settings = parsed as Record<string, unknown>;
    } catch {
      /* Preserve valid settings only. */
    }
    settings.routeReview = {
      stage: draft.stage,
      subtype: draft.subtype,
      applicationDate: draft.applicationDate,
      facts: draft.facts,
    };
    await db
      .update(visaApplicationTable)
      .set({ settings: JSON.stringify(settings), ...selected })
      .where(
        and(
          eq(visaApplicationTable.id, draft.applicationId),
          eq(visaApplicationTable.agencyId, agencyId),
          isNull(visaApplicationTable.trashedAt),
        ),
      );
    for (const person of draft.applicants) {
      await db
        .update(applicantTable)
        .set({ nationality: person.nationality || null, dateOfBirth: person.dateOfBirth || null })
        .where(
          and(
            eq(applicantTable.id, person.id),
            eq(applicantTable.applicationId, draft.applicationId),
          ),
        );
    }
    for (const write of getAgencyReviewInvalidationQueries({
      db,
      applicationId: draft.applicationId,
    }))
      await write;
    const saved = await loadReviewSnapshot({ db, applicationId: draft.applicationId });
    return { saved: true, reviewContextHash: saved.reviewContextHash };
  });
}
