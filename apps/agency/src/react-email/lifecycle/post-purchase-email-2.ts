export function postPurchaseEmail2Text({
  firstName,
  checklistUrl,
  evaluationUrl,
}: {
  firstName: string;
  checklistUrl: string;
  evaluationUrl: string;
}) {
  return `Hi ${firstName},

One day in, the goal is simple: do not let the workspace sit empty.

If you still need to add documents, start here:
Upload documents: ${checklistUrl}

If the documents are already there, do the more important step next:
Run evaluation: ${evaluationUrl}

The first evaluation gives you the baseline risk score, the red flags the AI found, and the highest-leverage fixes to make before submission.

Even a partial document set is enough to get useful signal. Start with what you have and improve from there.

Vidicy`;
}
