import "server-only";
import { CloudTasksClient } from "@google-cloud/tasks";
import { createHash } from "node:crypto";
import { getDocumentTaskConfiguration } from "./document-tasks";

let client: CloudTasksClient | undefined;

export async function enqueueChecklistJob({
  jobId,
  version = "initial",
}: {
  jobId: string;
  version?: string;
}) {
  const configuration = getDocumentTaskConfiguration();
  const queue =
    process.env.CHECKLIST_TASK_QUEUE ??
    process.env.REVIEW_TASK_QUEUE ??
    "vidicy-document-extraction";
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(queue)) throw new Error("Invalid checklist queue");
  const parent = `projects/${configuration.project}/locations/${configuration.region}/queues/${queue}`;
  const payload = JSON.stringify({ jobId });
  const name = `${parent}/tasks/checklist-${createHash("sha256").update(`${jobId}:${version}`).digest("hex")}`;
  client ??= new CloudTasksClient();
  try {
    await client.createTask(
      {
        parent,
        task: {
          name,
          dispatchDeadline: { seconds: 1800 },
          httpRequest: {
            url: `${configuration.audience}/api/internal/checklist-generation`,
            httpMethod: "POST",
            headers: { "Content-Type": "application/json" },
            body: Buffer.from(payload),
            oidcToken: {
              serviceAccountEmail: configuration.serviceAccountEmail,
              audience: configuration.audience,
            },
          },
        },
      },
      { timeout: 30_000 },
    );
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error.code === 6 || error.code === "ALREADY_EXISTS")
    )
      return;
    throw new Error("Cloud Tasks could not accept checklist work");
  }
}
