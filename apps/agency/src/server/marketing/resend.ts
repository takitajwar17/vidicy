import isProd from "@/utils/is-prod";
import { logger } from "@/infra/logger";

const RESEND_API_BASE = "https://api.resend.com";

export interface MarketingRuntimeEnv {
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  EMAIL_FROM_NAME?: string;
}

interface ResendTopic {
  id: string;
  name: string;
}

interface ResendContact {
  id: string;
  email: string;
}

interface ResendBroadcast {
  id: string;
}

function getEnvValue(env: MarketingRuntimeEnv | undefined, key: keyof MarketingRuntimeEnv) {
  return env?.[key] ?? process.env[key];
}

function isDryRun(env?: MarketingRuntimeEnv) {
  return !isProd || !getEnvValue(env, "RESEND_API_KEY");
}

async function resendRequest<T>(
  path: string,
  init: RequestInit,
  env?: MarketingRuntimeEnv,
): Promise<T> {
  const apiKey = getEnvValue(env, "RESEND_API_KEY");

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const response = await fetch(`${RESEND_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Resend API request failed (${response.status} ${response.statusText}): ${text}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function ensureResendTopic(
  env: MarketingRuntimeEnv | undefined,
  {
    name,
    description,
  }: {
    name: string;
    description: string;
  },
) {
  if (isDryRun(env)) {
    return { id: `dryrun_topic_${name}`, name };
  }

  const existing = await resendRequest<{ data: ResendTopic[] }>("/topics", { method: "GET" }, env);
  const found = existing.data.find((topic) => topic.name === name);

  if (found) {
    return found;
  }

  const created = await resendRequest<{ data: ResendTopic }>(
    "/topics",
    {
      method: "POST",
      body: JSON.stringify({
        name,
        description,
      }),
    },
    env,
  );

  return created.data;
}

export async function upsertResendContact(
  env: MarketingRuntimeEnv | undefined,
  {
    email,
    firstName,
    lastName,
  }: {
    email: string;
    firstName?: string | null;
    lastName?: string | null;
  },
) {
  if (isDryRun(env)) {
    logger.info("Lifecycle email dry-run contact sync", { email });
    return {
      id: `dryrun_contact_${email}`,
      email,
    };
  }

  try {
    const created = await resendRequest<{ data: ResendContact }>(
      "/contacts",
      {
        method: "POST",
        body: JSON.stringify({
          email,
          firstName: firstName ?? undefined,
          lastName: lastName ?? undefined,
        }),
      },
      env,
    );

    return created.data;
  } catch (error) {
    const updated = await resendRequest<{ data: ResendContact }>(
      `/contacts/${encodeURIComponent(email)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          firstName: firstName ?? undefined,
          lastName: lastName ?? undefined,
        }),
      },
      env,
    );

    logger.info("Lifecycle email contact updated after create fallback", {
      email,
      error: error instanceof Error ? error.message : String(error),
    });

    return updated.data;
  }
}

export async function updateResendContactTopics(
  env: MarketingRuntimeEnv | undefined,
  {
    email,
    topicSubscriptions,
  }: {
    email: string;
    topicSubscriptions: Array<{
      id: string;
      subscription: "opt_in" | "opt_out";
    }>;
  },
) {
  if (isDryRun(env)) {
    return;
  }

  await resendRequest(
      `/contacts/${encodeURIComponent(email)}/topics`,
      {
        method: "PATCH",
        body: JSON.stringify({
          topics: topicSubscriptions,
        }),
      },
      env,
  );
}

export async function createResendSegment(
  env: MarketingRuntimeEnv | undefined,
  { name }: { name: string },
) {
  if (isDryRun(env)) {
    return { id: `dryrun_segment_${name}`, name };
  }

  const created = await resendRequest<{ data: { id: string; name: string } }>(
    "/segments",
    {
      method: "POST",
      body: JSON.stringify({ name }),
    },
    env,
  );

  return created.data;
}

export async function addContactToResendSegment(
  env: MarketingRuntimeEnv | undefined,
  {
    email,
    segmentId,
  }: {
    email: string;
    segmentId: string;
  },
) {
  if (isDryRun(env)) {
    return;
  }

  await resendRequest(
    `/contacts/${encodeURIComponent(email)}/segments/${segmentId}`,
    {
      method: "POST",
    },
    env,
  );
}

export async function createAndSendLifecycleBroadcast(
  env: MarketingRuntimeEnv | undefined,
  {
    name,
    segmentId,
    subject,
    text,
  }: {
    name: string;
    segmentId: string;
    subject: string;
    text: string;
  },
) {
  if (isDryRun(env)) {
    logger.info("Lifecycle email dry-run broadcast", { name, segmentId, subject });
    return { id: `dryrun_broadcast_${name}` };
  }

  const fromEmail = getEnvValue(env, "EMAIL_FROM");
  const fromName = getEnvValue(env, "EMAIL_FROM_NAME");

  if (!fromEmail || !fromName) {
    throw new Error("EMAIL_FROM and EMAIL_FROM_NAME must be configured");
  }

  const broadcast = await resendRequest<{ data: ResendBroadcast }>(
    "/broadcasts",
    {
      method: "POST",
      body: JSON.stringify({
        name,
        from: `${fromName} <${fromEmail}>`,
        subject,
        text,
        segmentId,
      }),
    },
    env,
  );

  await resendRequest(
    `/broadcasts/${broadcast.data.id}/send`,
    {
      method: "POST",
    },
    env,
  );

  return broadcast.data;
}
