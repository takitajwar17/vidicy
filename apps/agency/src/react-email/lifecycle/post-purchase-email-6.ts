export function postPurchaseEmail6Text({
  firstName,
  checklistUrl,
  atlasUrl,
}: {
  firstName: string;
  checklistUrl: string;
  atlasUrl: string;
}) {
  return `Hi ${firstName},

This is your final scheduled check-in from the post-purchase sequence.

If anything in the application still feels unclear, go back to the checklist, tighten the remaining gaps, and use Atlas for targeted questions about the documents already in the workspace.

Checklist: ${checklistUrl}
Atlas: ${atlasUrl}

Vidicy`;
}
