import { createHash, randomBytes } from "node:crypto";

/**
 * API key helpers. Keys look like `crwl_<43-char base64url>`. We never store the
 * plaintext — only its SHA-256 hash — and surface a short prefix for display.
 */
const KEY_PREFIX = "crwl_";

export function generateApiKey(): string {
  return KEY_PREFIX + randomBytes(32).toString("base64url");
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** First few chars, shown in the UI so a user can recognise a key. */
export function keyPrefix(key: string): string {
  return key.slice(0, KEY_PREFIX.length + 6);
}
