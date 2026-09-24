export function postPurchaseEmail4bText({
  firstName,
  checklistUrl,
  evaluationUrl,
}: {
  firstName: string;
  checklistUrl: string;
  evaluationUrl: string;
}) {
  return `Hi ${firstName},

Your evaluation is still waiting. If you already uploaded documents, run the review now. If the workspace is still empty, upload the first document you have and start there.

Upload documents: ${checklistUrl}
Run evaluation: ${evaluationUrl}

Vidicy`;
}
