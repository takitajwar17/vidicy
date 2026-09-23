export function generateCsrfTokenValue(): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));

  return btoa(String.fromCharCode(...randomBytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}
