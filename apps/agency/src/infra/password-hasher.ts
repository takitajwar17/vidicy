interface HashPasswordParams {
  password: string;
  providedSalt?: Uint8Array<ArrayBuffer>;
}

async function hashPassword({ password, providedSalt }: HashPasswordParams) {
  const encoder = new TextEncoder();
  const salt = providedSalt || crypto.getRandomValues(new Uint8Array(16));

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  const exportedKey = await crypto.subtle.exportKey("raw", key);
  const hashBuffer = new Uint8Array(exportedKey);

  const hashHex = Array.from(hashBuffer)
    .map((b: number) => b.toString(16).padStart(2, "0"))
    .join("");
  const saltHex = Array.from(salt)
    .map((b: number) => b.toString(16).padStart(2, "0"))
    .join("");

  return `${saltHex}:${hashHex}`;
}

interface VerifyPasswordParams {
  storedHash: string;
  passwordAttempt: string;
}

async function verifyPassword({ storedHash, passwordAttempt }: VerifyPasswordParams) {
  const [saltHex, originalHash] = storedHash.split(":");

  if (!saltHex || !originalHash) {
    return false;
  }

  const matchResult = saltHex.match(/.{1,2}/g);
  if (!matchResult) {
    return false;
  }

  const salt = new Uint8Array(matchResult.map((byte: string) => parseInt(byte, 16)));

  const attemptHashWithSalt = await hashPassword({
    password: passwordAttempt,
    providedSalt: salt
  });
  const [, attemptHash] = attemptHashWithSalt.split(":");

  // Use constant-time comparison to prevent timing attacks
  if (attemptHash.length !== originalHash.length) {
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < attemptHash.length; i++) {
    mismatch |= attemptHash.charCodeAt(i) ^ originalHash.charCodeAt(i);
  }

  return mismatch === 0;
}

export { hashPassword, verifyPassword };
