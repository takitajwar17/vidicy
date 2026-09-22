import { getSessionFromCookie } from "@/utils/auth";
import { NextResponse } from "next/server";
import { tryCatch } from "@/lib/try-catch";
import { getConfig } from "@/flags";
import { withRateLimit } from "@/infra/with-rate-limit";
import { requireSameOriginRequest } from "@/app/api/_utils/request-auth";

export async function GET(request: Request) {
  return withRateLimit(
    async () => {
      const originResponse = requireSameOriginRequest(request);
      if (originResponse) {
        return originResponse;
      }

      const [{ data: session, error }, config] = await Promise.all([
        tryCatch(getSessionFromCookie()),
        getConfig(),
      ]);

      const headers = new Headers();
      headers.set(
        "Cache-Control",
        "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
      );
      headers.set("Pragma", "no-cache");
      headers.set("Expires", "0");
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("X-Frame-Options", "DENY");

      if (error) {
        return NextResponse.json(
          {
            session: null,
            config,
          },
          {
            headers,
          },
        );
      }

      return NextResponse.json(
        {
          session,
          config,
        },
        {
          headers,
        },
      );
    },
    {
      identifier: "get-session",
      limit: 60,
      windowInSeconds: 60,
    },
  );
}
