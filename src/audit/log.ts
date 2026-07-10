import { createHash } from "node:crypto";
import {
  access,
  appendFile,
  mkdir,
  readFile,
} from "node:fs/promises";
import { dirname } from "node:path";
import { redactSecrets } from "./redact.js";
import type { AuditEntry } from "./types.js";

/** Default audit log path (gitignored). Tests must use a temp file instead. */
export const DEFAULT_AUDIT_PATH = "data/audit.jsonl";

/** Genesis prevHash for the first entry in a chain (64 zero hex chars). */
export const GENESIS_HASH = "0".repeat(64);

export type AuditEntryWithoutHash = Omit<AuditEntry, "entryHash">;

export type AppendAuditPartial = Omit<
  AuditEntry,
  "timestamp" | "prevHash" | "entryHash" | "args"
> & {
  timestamp: string;
  args: Record<string, unknown>;
};

export type AppendAuditOpts = {
  /** Override wall-clock time; when set, used as the entry timestamp. */
  now?: string;
};

export type VerifyChainResult = {
  ok: boolean;
  brokenAtLine?: number;
  reason?: string;
};

/**
 * Canonical JSON: object keys sorted recursively so hashing is stable.
 */
function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortKeys(obj[key]);
  }
  return sorted;
}

/**
 * SHA-256 hex digest over canonical JSON of the entry excluding entryHash.
 * prevHash is included in the hashed payload.
 */
export function computeEntryHash(entryWithoutHash: AuditEntryWithoutHash): string {
  return createHash("sha256").update(canonicalJson(entryWithoutHash)).digest("hex");
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readLastEntryHash(filePath: string): Promise<string> {
  if (!(await fileExists(filePath))) {
    return GENESIS_HASH;
  }
  const content = await readFile(filePath, "utf8");
  const lines = content.split("\n").filter((line) => line.length > 0);
  if (lines.length === 0) {
    return GENESIS_HASH;
  }
  const last = JSON.parse(lines[lines.length - 1]) as AuditEntry;
  return last.entryHash;
}

/**
 * Append one hash-chained audit entry as a JSONL line.
 * Caller must supply timestamp, actorFingerprint, and principal for determinism.
 */
export async function appendAudit(
  filePath: string,
  partialEntry: AppendAuditPartial,
  opts?: AppendAuditOpts,
): Promise<AuditEntry> {
  const prevHash = await readLastEntryHash(filePath);
  const timestamp = opts?.now ?? partialEntry.timestamp;
  const args = redactSecrets(partialEntry.args);

  const withoutHash: AuditEntryWithoutHash = {
    ...partialEntry,
    timestamp,
    args,
    prevHash,
  };

  const entryHash = computeEntryHash(withoutHash);
  const entry: AuditEntry = { ...withoutHash, entryHash };

  await mkdir(dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf8");

  return entry;
}

/**
 * Recompute hashes and verify the prevHash chain for every line in the file.
 */
export async function verifyChain(filePath: string): Promise<VerifyChainResult> {
  if (!(await fileExists(filePath))) {
    return { ok: true };
  }

  const content = await readFile(filePath, "utf8");
  const lines = content.split("\n").filter((line) => line.length > 0);

  let expectedPrev = GENESIS_HASH;

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1;
    let entry: AuditEntry;
    try {
      entry = JSON.parse(lines[i]) as AuditEntry;
    } catch {
      return {
        ok: false,
        brokenAtLine: lineNumber,
        reason: "invalid JSON",
      };
    }

    if (entry.prevHash !== expectedPrev) {
      return {
        ok: false,
        brokenAtLine: lineNumber,
        reason: "prevHash mismatch",
      };
    }

    const { entryHash: storedHash, ...withoutHash } = entry;
    const recomputed = computeEntryHash(withoutHash);
    if (recomputed !== storedHash) {
      return {
        ok: false,
        brokenAtLine: lineNumber,
        reason: "entryHash mismatch",
      };
    }

    expectedPrev = storedHash;
  }

  return { ok: true };
}
