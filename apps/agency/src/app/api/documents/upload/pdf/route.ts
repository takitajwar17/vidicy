import "server-only";

import { handleDocumentUploadRoute } from "@/app/api/_utils/document-upload";

export async function POST(request: Request) {
  return handleDocumentUploadRoute({
    request,
    routeKind: "pdf",
  });
}
