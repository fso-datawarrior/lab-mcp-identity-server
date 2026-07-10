import { randomUUID } from "node:crypto";
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Default pending-request directory (gitignored). Tests must pass a temp dir. */
export const DEFAULT_PENDING_DIR = "data/pending";

export type PendingStatus =
  | "pending"
  | "approved"
  | "denied"
  | "expired"
  | "drift-failed";

export type PendingRequest = {
  requestId: string;
  tool: string;
  args: Record<string, unknown>;
  tier: 3;
  actorFingerprint: string;
  principal: string;
  justification: string;
  targetUser: string;
  createdAt: string;
  expiresAt: string;
  status: PendingStatus;
};

export type CreatePendingInput = {
  tool: string;
  args: Record<string, unknown>;
  tier: 3;
  actorFingerprint: string;
  principal: string;
  justification: string;
  targetUser: string;
};

export type CreatePendingOpts = {
  now: string;
  ttlSeconds?: number;
};

export type ResolvePendingParams = {
  dir: string;
  requestId: string;
  decision: "approve" | "deny";
  approverCredential: string;
  expectedCredential: string;
  now: string;
  precondition?: () => Promise<{ ok: boolean; reason?: string }>;
  executor?: () => Promise<void>;
};

export type ResolveResult = {
  resolved: boolean;
  status?: PendingStatus;
  reason?: string;
};

function requestPath(dir: string, requestId: string): string {
  return join(dir, requestId + ".json");
}

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

async function writeRequest(
  dir: string,
  request: PendingRequest,
): Promise<void> {
  await ensureDir(dir);
  await writeFile(
    requestPath(dir, request.requestId),
    JSON.stringify(request, null, 2) + "\n",
    "utf8",
  );
}

function addSeconds(isoNow: string, ttlSeconds: number): string {
  const ms = Date.parse(isoNow);
  if (Number.isNaN(ms)) {
    throw new Error("invalid now timestamp: " + isoNow);
  }
  return new Date(ms + ttlSeconds * 1000).toISOString();
}

function isExpired(now: string, expiresAt: string): boolean {
  return Date.parse(now) > Date.parse(expiresAt);
}

/**
 * Create a durable, single-use, TTL-bounded pending approval on disk.
 * Returns the public handle (requestId); never returns a secret.
 */
export async function createPending(
  dir: string,
  input: CreatePendingInput,
  opts: CreatePendingOpts,
): Promise<PendingRequest> {
  const ttlSeconds = opts.ttlSeconds ?? 300;
  const request: PendingRequest = {
    requestId: randomUUID(),
    tool: input.tool,
    args: { ...input.args },
    tier: 3,
    actorFingerprint: input.actorFingerprint,
    principal: input.principal,
    justification: input.justification,
    targetUser: input.targetUser,
    createdAt: opts.now,
    expiresAt: addSeconds(opts.now, ttlSeconds),
    status: "pending",
  };
  await writeRequest(dir, request);
  return request;
}

/**
 * Load one pending request by id, or null if the file is missing.
 */
export async function getPending(
  dir: string,
  requestId: string,
): Promise<PendingRequest | null> {
  try {
    await access(requestPath(dir, requestId));
  } catch {
    return null;
  }
  const raw = await readFile(requestPath(dir, requestId), "utf8");
  return JSON.parse(raw) as PendingRequest;
}

/**
 * List all requests currently in status "pending".
 */
export async function listPending(dir: string): Promise<PendingRequest[]> {
  try {
    await access(dir);
  } catch {
    return [];
  }
  const names = await readdir(dir);
  const out: PendingRequest[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) {
      continue;
    }
    const raw = await readFile(join(dir, name), "utf8");
    const req = JSON.parse(raw) as PendingRequest;
    if (req.status === "pending") {
      out.push(req);
    }
  }
  return out;
}

/**
 * Resolve a pending request out of band. Fail closed on expiry, drift,
 * wrong credential, and already-resolved. Executor runs at most once.
 */
export async function resolvePending(
  params: ResolvePendingParams,
): Promise<ResolveResult> {
  const request = await getPending(params.dir, params.requestId);
  if (request === null) {
    return { resolved: false, reason: "not found" };
  }

  if (request.status !== "pending") {
    return {
      resolved: false,
      reason: "already resolved: " + request.status,
    };
  }

  if (isExpired(params.now, request.expiresAt)) {
    request.status = "expired";
    await writeRequest(params.dir, request);
    return { resolved: false, status: "expired", reason: "expired" };
  }

  if (params.approverCredential !== params.expectedCredential) {
    return { resolved: false, reason: "invalid credential" };
  }

  if (params.decision === "deny") {
    request.status = "denied";
    await writeRequest(params.dir, request);
    return { resolved: true, status: "denied" };
  }

  // decision === "approve"
  if (params.precondition) {
    const check = await params.precondition();
    if (!check.ok) {
      request.status = "drift-failed";
      await writeRequest(params.dir, request);
      return {
        resolved: true,
        status: "drift-failed",
        reason: check.reason,
      };
    }
  }

  if (params.executor) {
    await params.executor();
  }
  request.status = "approved";
  await writeRequest(params.dir, request);
  return { resolved: true, status: "approved" };
}
