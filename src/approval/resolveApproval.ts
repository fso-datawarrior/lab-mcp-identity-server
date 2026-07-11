import { createHash } from "node:crypto";
import { appendAudit } from "../audit/log.js";
import type { OktaClient } from "../okta/client.js";
import {
  getPending,
  resolvePending,
  type PendingStatus,
  type ResolveResult,
} from "./pendingStore.js";

export type ResolveApprovalParams = {
  dir: string;
  auditPath: string;
  requestId: string;
  decision: "approve" | "deny";
  approverCredential: string;
  expectedCredential: string;
  now: string;
  client: OktaClient;
};

type AuditedDecision = "approved" | "denied" | "drift-failed" | "expired";

const AUDITED_STATUSES: ReadonlySet<AuditedDecision> = new Set([
  "approved",
  "denied",
  "drift-failed",
  "expired",
]);

function isAuditedDecision(status: PendingStatus): status is AuditedDecision {
  return AUDITED_STATUSES.has(status as AuditedDecision);
}

/** SHA-256 hex fingerprint of the approver credential (never the raw secret). */
export function fingerprintCredential(credential: string): string {
  return createHash("sha256").update(credential).digest("hex").slice(0, 12);
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("pending request missing string arg: " + field);
  }
  return value;
}

/**
 * Out-of-band resolution: re-check preconditions, execute at most once, audit.
 */
export async function resolveApproval(
  params: ResolveApprovalParams,
): Promise<ResolveResult> {
  const request = await getPending(params.dir, params.requestId);
  if (request === null) {
    return { resolved: false, reason: "not found" };
  }

  let precondition: (() => Promise<{ ok: boolean; reason?: string }>) | undefined;
  let executor: (() => Promise<void>) | undefined;

  if (request.tool === "revoke_access") {
    const userId = asString(request.args.userId, "userId");
    const group = asString(request.args.group, "group");
    precondition = async () => {
      const u = await params.client.getUser(userId);
      return {
        ok: !!u && u.groups.includes(group),
        reason: "user no longer a member of " + group,
      };
    };
    executor = async () => {
      await params.client.removeUserFromGroup(userId, group);
    };
  } else if (request.tool === "deactivate_user") {
    const userId = asString(request.args.userId, "userId");
    precondition = async () => {
      const u = await params.client.getUser(userId);
      return {
        ok: !!u && u.status !== "DEACTIVATED",
        reason: "user not active",
      };
    };
    executor = async () => {
      await params.client.deactivateUser(userId);
    };
  }

  const result = await resolvePending({
    dir: params.dir,
    requestId: params.requestId,
    decision: params.decision,
    approverCredential: params.approverCredential,
    expectedCredential: params.expectedCredential,
    now: params.now,
    precondition,
    executor,
  });

  if (result.status && isAuditedDecision(result.status)) {
    const decision: AuditedDecision = result.status;
    let oktaSummary: string;
    if (decision === "approved") {
      oktaSummary =
        "approved and executed: " +
        request.tool +
        " on " +
        request.targetUser;
    } else if (decision === "denied") {
      oktaSummary = "denied by approver";
    } else if (decision === "drift-failed") {
      oktaSummary = "precondition drift: " + (result.reason ?? "");
    } else {
      oktaSummary = "expired before approval";
    }

    await appendAudit(
      params.auditPath,
      {
        timestamp: params.now,
        tool: request.tool,
        tier: 3,
        actorFingerprint: request.actorFingerprint,
        principal: request.principal,
        targetUser: request.targetUser,
        args: request.args,
        justification: request.justification,
        decision,
        approverCredential:
          decision === "expired"
            ? null
            : fingerprintCredential(params.approverCredential),
        oktaSummary,
      },
      { now: params.now },
    );
  }

  return result;
}
