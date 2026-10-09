import "server-only";

import { headers } from "next/headers";
import { isIP } from "node:net";

export async function getIP() {
  const headersList = await headers();

  if (process.env.GOOGLE_CLOUD_PROJECT) {
    // Enable this only with Cloud Run ingress restricted to internal traffic
    // and Cloud Load Balancing. The load balancer replaces this header.
    if (process.env.TRUST_GOOGLE_LOAD_BALANCER_HEADERS === "true") {
      const clientIp = headersList.get("x-vidicy-client-ip")?.trim();
      return clientIp && isIP(clientIp) ? clientIp : null;
    }
    // On the direct service URL, use the last platform-provided proxy hop.
    // Client-supplied Cloudflare headers must not control rate-limit identity.
    const clientIp = headersList.get("x-forwarded-for")?.split(",").at(-1)?.trim();
    return clientIp && isIP(clientIp) ? clientIp : null;
  }

  const ip =
    headersList.get("cf-connecting-ip") ||
    headersList.get("x-forwarded-for") ||
    headersList.get("x-real-ip") ||
    headersList.get("true-client-ip") ||
    headersList.get("x-client-ip") ||
    headersList.get("x-cluster-client-ip") ||
    null;

  if (!ip) {
    return null;
  }

  return ip;
}
