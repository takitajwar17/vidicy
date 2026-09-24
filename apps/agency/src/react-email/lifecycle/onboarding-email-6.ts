export function onboardingEmail6Text({
  firstName,
  atlasUrl,
  checklistUrl,
  hasUploadedDocuments,
}: {
  firstName: string;
  atlasUrl: string;
  checklistUrl: string;
  hasUploadedDocuments: boolean;
}) {
  if (hasUploadedDocuments) {
    return `Hi ${firstName},

Meet Atlas, the assistant inside Vidicy that answers questions from your actual application instead of generic visa advice.

Once your documents are in the workspace, Atlas can help you ask better questions about missing evidence, weak spots, and next steps without starting from scratch every time.

Open Atlas: ${atlasUrl}

Vidicy`;
  }

  return `Hi ${firstName},

Atlas becomes useful once it has real documents to work from. Right now, the best next step is simply to upload the files you already have so the workspace can start giving you case-specific help.

Upload documents to unlock Atlas: ${checklistUrl}

Vidicy`;
}
