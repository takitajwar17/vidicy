export function postPurchaseEmail5Text({
  firstName,
  evaluationUrl,
}: {
  firstName: string;
  evaluationUrl: string;
}) {
  return `Hi ${firstName},

Round two is usually where the application gets materially stronger.

If you fixed the top issues from the first pass, run the evaluation again and see what moved. If the score is still not where you want it, that is normal. Keep tightening the biggest gaps first.

Run another evaluation: ${evaluationUrl}

Vidicy`;
}
