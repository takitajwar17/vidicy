export function postPurchaseEmail4aText({
  firstName,
  evaluationUrl,
}: {
  firstName: string;
  evaluationUrl: string;
}) {
  return `Hi ${firstName},

You have evaluation results now. Use them as a worklist, not a verdict.

Start with the highest-priority flags, fix the clearest evidence gaps first, then re-run the evaluation. Most strong applications are improved over more than one pass.

Review my evaluation: ${evaluationUrl}

Vidicy`;
}
