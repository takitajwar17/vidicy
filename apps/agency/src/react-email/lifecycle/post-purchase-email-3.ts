export function postPurchaseEmail3Text({
  firstName,
  evaluationUrl,
}: {
  firstName: string;
  evaluationUrl: string;
}) {
  return `Hi ${firstName},

When Vidicy evaluates your application, it is looking for the things applicants rarely catch manually:
- mismatched names
- unexplained date gaps
- figures that do not support the travel story
- embassy-specific requirements that generic checklists miss

That is why the first evaluation matters even if your documents are incomplete.

Run or review your evaluation: ${evaluationUrl}

Vidicy`;
}
