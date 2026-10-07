import "server-only";

import { OAuth2Client } from "google-auth-library";
import { getDocumentTaskConfiguration } from "./document-tasks";

const oidcVerifier = new OAuth2Client();

/** Both Cloud Tasks and Scheduler must use this service account and audience. */
export async function verifyInternalGoogleRequest({ request }: { request: Request }): Promise<Response | null> {
  let configuration: ReturnType<typeof getDocumentTaskConfiguration>;
  try {
    configuration = getDocumentTaskConfiguration();
  } catch {
    return Response.json({ error: "Internal service configuration is unavailable" }, { status: 503 });
  }
  const bearer = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i);
  if (!bearer) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const ticket = await oidcVerifier.verifyIdToken({ idToken: bearer[1], audience: configuration.audience });
    const identity = ticket.getPayload();
    if (!identity || identity.email_verified !== true || identity.email !== configuration.serviceAccountEmail) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    return null;
  } catch {
    // Caller-controlled task or scheduler headers do not establish identity.
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
}
