const SECRET_KEY = /token|secret|password|assertion|privatekey/i;

/**
 * Returns a shallow copy of args with secret-looking key values redacted.
 * Matching is case-insensitive on the key name.
 */
export function redactSecrets(
  args: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    out[key] = SECRET_KEY.test(key) ? "[REDACTED]" : value;
  }
  return out;
}
