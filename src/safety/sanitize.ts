import type { OktaUser } from "../okta/client.js";

// C0 (U+0000-U+001F), DEL (U+007F), and C1 (U+0080-U+009F).
const CONTROL_CHARS = /[\u0000-\u001F\u007F\u0080-\u009F]/g;
// Zero-width, BOM, bidi overrides/isolates, line/paragraph separators, word joiner.
const ZERO_WIDTH_AND_BIDI =
  /[\u200B\u200C\u200D\uFEFF\u202A-\u202E\u2066-\u2069\u2028\u2029\u2060]/g;

/**
 * Clean an untrusted string from Okta (or similar) before it reaches a model or human.
 *
 * Strips injection characters (C0/C1 controls, zero-width, bidi overrides, LS/PS,
 * word joiner) but does not neutralize semantic instruction text. Delimiter wrapping
 * of untrusted text into the human approval prompt is handled later in M3.
 */
export function sanitizeUntrusted(value: string, maxLen = 256): string {
  const cleaned = value
    .replace(CONTROL_CHARS, "")
    .replace(ZERO_WIDTH_AND_BIDI, "")
    .trim();
  if (cleaned.length <= maxLen) {
    return cleaned;
  }
  return cleaned.slice(0, maxLen);
}

/**
 * Return a copy of an Okta user with untrusted profile fields sanitized.
 * id is passed through unchanged.
 */
export function sanitizeUser(user: OktaUser): OktaUser {
  return {
    id: user.id,
    status: sanitizeUntrusted(user.status),
    login: sanitizeUntrusted(user.login),
    displayName: sanitizeUntrusted(user.displayName),
    groups: user.groups.map((g) => sanitizeUntrusted(g)),
  };
}
