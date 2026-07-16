import { randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  open,
  readdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import {
  getOktaClientMode,
  type OktaClientMode,
} from "../config/oktaConfig.js";

/** Default pending-request directory (gitignored). Tests must pass a temp dir. */
export const DEFAULT_PENDING_DIR = "data/pending";

export type PendingStatus =
  | "pending"
  | "approving"
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
  /** Okta client mode active when the request was created (optional on legacy files). */
  clientMode?: OktaClientMode;
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
  clientMode?: OktaClientMode;
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
    clientMode: opts.clientMode ?? getOktaClientMode(),
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
 * "approving" limbo requests are excluded (they need reconciliation, not listing).
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
 * Atomically claim exclusive resolution of a request (O_EXCL lock file).
 * Returns true if this caller won the claim; false if another resolver holds it.
 */
async function tryClaim(
  dir: string,
  requestId: string,
): Promise<boolean> {
  await ensureDir(dir);
  const lockPath = join(dir, requestId + ".lock");
  try {
    const handle = await open(lockPath, "wx");
    await handle.close();
    return true;
  } catch (err: unknown) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code: unknown }).code)
        : "";
    if (code === "EEXIST") {
      return false;
    }
    throw err;
  }
}

/**
 * Resolve a pending request out of band. Fail closed on expiry, drift,
 * wrong credential, and already-resolved. Executor runs at most once,
 * including under concurrent resolvers (O_EXCL claim lock) and across a crash.
 *
 * At-most-once across a crash: on approve, after the precondition passes we
 * persist status "approving" BEFORE running the executor. If the process dies
 * mid-executor, the request stays in "approving" limbo. A retry then hits the
 * already-resolved guard (status !== "pending") and returns
 * "already resolved: approving" without re-running the executor. A human must
 * reconcile limbo requests; they are never auto-retried.
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

  if (params.approverCredential !== params.expectedCredential) {
    return { resolved: false, reason: "invalid credential" };
  }

  const claimed = await tryClaim(params.dir, params.requestId);
  if (!claimed) {
    const again = await getPending(params.dir, params.requestId);
    return {
      resolved: false,
      reason: "already resolved: " + (again?.status ?? "claim-held"),
    };
  }

  // Re-read after the exclusive claim so status mutations cannot race.
  const claimedRequest = await getPending(params.dir, params.requestId);
  if (claimedRequest === null) {
    return { resolved: false, reason: "not found" };
  }
  if (claimedRequest.status !== "pending") {
    return {
      resolved: false,
      reason: "already resolved: " + claimedRequest.status,
    };
  }

  if (isExpired(params.now, claimedRequest.expiresAt)) {
    claimedRequest.status = "expired";
    await writeRequest(params.dir, claimedRequest);
    return { resolved: false, status: "expired", reason: "expired" };
  }

  if (params.decision === "deny") {
    claimedRequest.status = "denied";
    await writeRequest(params.dir, claimedRequest);
    return { resolved: true, status: "denied" };
  }

  // decision === "approve"
  if (params.precondition) {
    const check = await params.precondition();
    if (!check.ok) {
      claimedRequest.status = "drift-failed";
      await writeRequest(params.dir, claimedRequest);
      return {
        resolved: true,
        status: "drift-failed",
        reason: check.reason,
      };
    }
  }

  // Persist "approving" before the side effect so a crash cannot re-execute.
  claimedRequest.status = "approving";
  await writeRequest(params.dir, claimedRequest);

  if (params.executor) {
    await params.executor();
  }
  claimedRequest.status = "approved";
  await writeRequest(params.dir, claimedRequest);
  return { resolved: true, status: "approved" };
}
