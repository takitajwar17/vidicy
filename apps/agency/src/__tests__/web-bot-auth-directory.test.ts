import { afterEach, describe, expect, it } from "vitest";

import { GET, HEAD } from "@/app/.well-known/http-message-signatures-directory/route";

const originalPublicJwk = process.env.WEB_BOT_AUTH_PUBLIC_JWK;
const originalPrivateJwk = process.env.WEB_BOT_AUTH_PRIVATE_JWK;

const testPublicJwk = JSON.stringify({
  kty: "OKP",
  crv: "Ed25519",
  x: "JrQLj5P_89iXES9-vFgrIy29clF9CC_oPPsw3c5D0bs",
  use: "sig",
});

const testPrivateJwk = JSON.stringify({
  kty: "OKP",
  crv: "Ed25519",
  x: "JrQLj5P_89iXES9-vFgrIy29clF9CC_oPPsw3c5D0bs",
  d: "n4Ni-HpISpVObnQMW0wOhCKROaIKqKtW_2ZYb2p9KcU",
});

describe("web bot auth directory route", () => {
  afterEach(() => {
    if (originalPublicJwk === undefined) {
      delete process.env.WEB_BOT_AUTH_PUBLIC_JWK;
    } else {
      process.env.WEB_BOT_AUTH_PUBLIC_JWK = originalPublicJwk;
    }

    if (originalPrivateJwk === undefined) {
      delete process.env.WEB_BOT_AUTH_PRIVATE_JWK;
    } else {
      process.env.WEB_BOT_AUTH_PRIVATE_JWK = originalPrivateJwk;
    }
  });

  it("returns an Ed25519 JWKS directory with signed directory headers when configured", async () => {
    process.env.WEB_BOT_AUTH_PUBLIC_JWK = testPublicJwk;
    process.env.WEB_BOT_AUTH_PRIVATE_JWK = testPrivateJwk;

    const response = await GET(
      new Request("https://vidicy.com/.well-known/http-message-signatures-directory"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/http-message-signatures-directory+json",
    );
    expect(response.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(response.headers.get("signature")).toMatch(/^dir=:/);

    const signatureInput = response.headers.get("signature-input");
    expect(signatureInput).toContain('tag="http-message-signatures-directory"');
    expect(signatureInput).toContain('alg="ed25519"');
    expect(signatureInput).toContain('keyid="');

    await expect(response.json()).resolves.toEqual({
      keys: [
        {
          kty: "OKP",
          crv: "Ed25519",
          kid: expect.any(String),
          x: "JrQLj5P_89iXES9-vFgrIy29clF9CC_oPPsw3c5D0bs",
          use: "sig",
        },
      ],
    });
  });

  it("returns the same discovery headers for HEAD requests without a body", async () => {
    process.env.WEB_BOT_AUTH_PUBLIC_JWK = testPublicJwk;
    process.env.WEB_BOT_AUTH_PRIVATE_JWK = testPrivateJwk;

    const response = await HEAD(
      new Request("https://vidicy.com/.well-known/http-message-signatures-directory"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/http-message-signatures-directory+json",
    );
    expect(response.headers.get("signature")).toMatch(/^dir=:/);
    expect(response.headers.get("signature-input")).toContain('"@authority"');
    expect(await response.text()).toBe("");
  });

  it("returns a configuration error when the public JWK is missing", async () => {
    delete process.env.WEB_BOT_AUTH_PUBLIC_JWK;
    delete process.env.WEB_BOT_AUTH_PRIVATE_JWK;

    const response = await GET(
      new Request("https://vidicy.com/.well-known/http-message-signatures-directory"),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    await expect(response.json()).resolves.toEqual({
      error: "WEB_BOT_AUTH_PUBLIC_JWK is not configured.",
    });
  });
});
