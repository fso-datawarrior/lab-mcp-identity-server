export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class RateLimitedError extends Error {
  readonly retryAfter: string | undefined;

  constructor(message: string, retryAfter?: string) {
    super(message);
    this.name = "RateLimitedError";
    this.retryAfter = retryAfter;
  }
}

function headerValue(
  headers: Record<string, unknown> | undefined,
  name: string,
): string | undefined {
  if (!headers) {
    return undefined;
  }
  const key = Object.keys(headers).find(
    (k) => k.toLowerCase() === name.toLowerCase(),
  );
  if (!key) {
    return undefined;
  }
  const raw = headers[key];
  if (typeof raw === "string") {
    return raw;
  }
  if (Array.isArray(raw) && typeof raw[0] === "string") {
    return raw[0];
  }
  return undefined;
}

export function httpStatus(err: unknown): number | undefined {
  if (!err || typeof err !== "object") {
    return undefined;
  }
  if ("status" in err && typeof err.status === "number") {
    return err.status;
  }
  if ("code" in err && typeof err.code === "number") {
    return err.code;
  }
  return undefined;
}

function httpHeaders(err: unknown): Record<string, unknown> | undefined {
  if (!err || typeof err !== "object" || !("headers" in err)) {
    return undefined;
  }
  const headers = (err as { headers?: unknown }).headers;
  if (!headers || typeof headers !== "object") {
    return undefined;
  }
  return headers as Record<string, unknown>;
}

/**
 * Map Okta SDK errors (OktaApiError.status or ApiException.code) to typed errors.
 */
export function mapOktaSdkError(err: unknown): Error {
  const status = httpStatus(err);
  if (status === 404) {
    return new NotFoundError("resource not found");
  }
  if (status === 403) {
    return new ForbiddenError("forbidden");
  }
  if (status === 429) {
    const retryAfter = headerValue(httpHeaders(err), "retry-after");
    const suffix = retryAfter ? " (retry-after: " + retryAfter + ")" : "";
    return new RateLimitedError("rate limited" + suffix, retryAfter);
  }
  if (err instanceof Error) {
    return err;
  }
  return new Error(String(err));
}
