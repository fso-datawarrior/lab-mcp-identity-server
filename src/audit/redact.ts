const SECRET_KEY = /token|secret|password|assertion|privatekey/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }
  if (isPlainObject(value)) {
    return redactSecrets(value);
  }
  return value;
}

/**
 * Returns a deep-cleaned copy of args. Any key matching
 * /token|secret|password|assertion|privatekey/i is replaced with "[REDACTED]"
 * (the whole value, not recursed). Nested plain objects and arrays are walked.
 * Matching is case-insensitive on the key name. Structure and key order are preserved.
 */
export function redactSecrets(
  args: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (SECRET_KEY.test(key)) {
      out[key] = "[REDACTED]";
    } else {
      out[key] = redactValue(value);
    }
  }
  return out;
}
