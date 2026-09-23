import "server-only";

const DIRECTORY_CACHE_MAX_AGE_SECONDS = 60 * 60 * 24;
const DIRECTORY_SIGNATURE_TTL_SECONDS = DIRECTORY_CACHE_MAX_AGE_SECONDS;

export const HTTP_MESSAGE_SIGNATURES_DIRECTORY_CONTENT_TYPE =
  "application/http-message-signatures-directory+json";

interface Ed25519Jwk extends JsonWebKey {
  kty: "OKP";
  crv: "Ed25519";
  x: string;
  d?: string;
  kid?: string;
  use?: string;
  nbf?: number;
  exp?: number;
}

interface ConfiguredPublicDirectoryJwk extends Ed25519Jwk {
  kid: string;
  use: string;
}

function parseJwk(value: string | undefined): Ed25519Jwk | null {
  if (!value) {
    return null;
  }

  const parsed = JSON.parse(value) as JsonWebKey;

  if (parsed.kty !== "OKP" || parsed.crv !== "Ed25519" || typeof parsed.x !== "string") {
    throw new Error("Web Bot Auth JWK must be an Ed25519 OKP key with an x coordinate.");
  }

  return parsed as Ed25519Jwk;
}

function toBase64Url(bytes: Uint8Array) {
  return Buffer.from(bytes)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function toBase64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64");
}

async function sha256(input: string) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return new Uint8Array(digest);
}

function createThumbprintPayload(jwk: Ed25519Jwk) {
  return `{"crv":"${jwk.crv}","kty":"${jwk.kty}","x":"${jwk.x}"}`;
}

export async function getJwkThumbprint(jwk: Ed25519Jwk) {
  return toBase64Url(await sha256(createThumbprintPayload(jwk)));
}

export async function getConfiguredPublicDirectoryJwk() {
  const jwk = parseJwk(process.env.WEB_BOT_AUTH_PUBLIC_JWK);

  if (!jwk) {
    return null;
  }

  return {
    ...jwk,
    kid: jwk.kid ?? (await getJwkThumbprint(jwk)),
    use: jwk.use ?? "sig",
  };
}

export function getConfiguredPrivateDirectoryJwk() {
  const jwk = parseJwk(process.env.WEB_BOT_AUTH_PRIVATE_JWK);

  if (!jwk || typeof jwk.d !== "string") {
    return null;
  }

  return jwk;
}

export function buildDirectoryBody(publicJwk: ConfiguredPublicDirectoryJwk) {
  return {
    keys: [
      {
        kty: publicJwk.kty,
        crv: publicJwk.crv,
        kid: publicJwk.kid,
        x: publicJwk.x,
        use: publicJwk.use,
        ...(typeof publicJwk.nbf === "number" ? { nbf: publicJwk.nbf } : {}),
        ...(typeof publicJwk.exp === "number" ? { exp: publicJwk.exp } : {}),
      },
    ],
  };
}

function buildSignatureInputValue({ keyId, created, expires }: {
  keyId: string;
  created: number;
  expires: number;
}) {
  return `dir=("@authority");created=${created};expires=${expires};keyid="${keyId}";alg="ed25519";tag="http-message-signatures-directory"`;
}

function buildSignatureBase({ authority, signatureInputValue }: {
  authority: string;
  signatureInputValue: string;
}) {
  const signatureParamsValue = signatureInputValue.slice(signatureInputValue.indexOf("=") + 1);

  return `"@authority": ${authority}\n"@signature-params": ${signatureParamsValue}`;
}

export async function buildDirectorySignatureHeaders(input: {
  authority: string;
  publicJwk: ConfiguredPublicDirectoryJwk;
  privateJwk: NonNullable<ReturnType<typeof getConfiguredPrivateDirectoryJwk>>;
}) {
  const created = Math.floor(Date.now() / 1000);
  const expires = created + DIRECTORY_SIGNATURE_TTL_SECONDS;
  const keyId = input.publicJwk.kid ?? (await getJwkThumbprint(input.publicJwk));
  const signatureInputValue = buildSignatureInputValue({
    keyId,
    created,
    expires,
  });
  const signatureBase = buildSignatureBase({
    authority: input.authority,
    signatureInputValue,
  });
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    input.privateJwk,
    { name: "Ed25519" },
    false,
    ["sign"],
  );
  const signatureBytes = new Uint8Array(
    await crypto.subtle.sign("Ed25519", privateKey, new TextEncoder().encode(signatureBase)),
  );

  return {
    Signature: `dir=:${toBase64(signatureBytes)}:`,
    "Signature-Input": signatureInputValue,
  };
}

export function getDirectoryCacheControl() {
  return `public, max-age=${DIRECTORY_CACHE_MAX_AGE_SECONDS}`;
}
