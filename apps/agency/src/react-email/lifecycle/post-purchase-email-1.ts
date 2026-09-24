export function postPurchaseEmail1Text({
  firstName,
  checklistUrl,
}: {
  firstName: string;
  checklistUrl: string;
}) {
  return `Hi ${firstName},

Your payment is confirmed and your full Vidicy workspace is ready.

Here is the fastest path to value:
1. Upload the documents you already have
2. Run the first evaluation
3. Fix the highest-risk issues first
4. Re-upload and re-evaluate until the package is stronger

Most users improve their application over two or three rounds, not one. The important thing is to get the first upload done now so the AI has something real to review.

Upload my documents: ${checklistUrl}

Vidicy`;
}
