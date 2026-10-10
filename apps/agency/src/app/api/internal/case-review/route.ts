import "server-only";
import { verifyInternalGoogleRequest } from "@/infra/google/internal-auth";
import { processReviewJob } from "@/server/review-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 1800;

export async function POST(request: Request) {
  const denied = await verifyInternalGoogleRequest({ request });
  if (denied) return denied;
  let payload: unknown;
  try {
    if (!request.body) throw new Error("Missing body");
    const reader = request.body.getReader();
    let body = "";
    try {
      let size = 0;
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 4096) {
          await reader.cancel();
          throw new Error("Body too large");
        }
        chunks.push(value);
      }
      body = Buffer.concat(chunks).toString("utf8");
    } finally {
      reader.releaseLock();
    }
    payload = JSON.parse(body);
    if (
      !payload ||
      typeof payload !== "object" ||
      Object.keys(payload).length !== 1 ||
      !("jobId" in payload) ||
      typeof payload.jobId !== "string" ||
      !/^rjob_[a-z0-9]{1,128}$/.test(payload.jobId)
    )
      throw new Error("Invalid payload");
  } catch {
    return Response.json({ error: "Invalid review task" }, { status: 400 });
  }
  try {
    await processReviewJob(payload as { jobId: string });
    return new Response(null, { status: 204 });
  } catch {
    return Response.json({ error: "Review requires another attempt" }, { status: 503 });
  }
}
