import { createHash } from "node:crypto";
import { appendAudit } from "../audit/log.js";
import { getOktaClientMode } from "../config/oktaConfig.js";
import type { OktaClient } from "../okta/client.js";
import { assertDemoGroupAllowed } from "../policy/demoGroupAllowlist.js";
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
  signingKey?: string;
  allowedGroupId?: string;
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

/** Prefer groupId from new-format pending files; fall back to legacy group field. */
function resolveStoredGroupArgs(
  args: Record<string, unknown>,
): { groupId: string; groupName: string } {
  if (typeof args.groupId === "string" && args.groupId.length > 0) {
    const groupName =
      typeof args.groupName === "string" && args.groupName.length > 0
        ? args.groupName
        : args.groupId;
    return { groupId: args.groupId, groupName };
  }
  const legacy = asString(args.group, "group");
  return { groupId: legacy, groupName: legacy };
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

  const resolverMode = getOktaClientMode();
  if (request.clientMode && request.clientMode !== resolverMode) {
    const reason =
      "client mode mismatch: request created in " +
      request.clientMode +
      ", resolver running in " +
      resolverMode;
    console.error(
      "[lab3] approval refused: " +
        reason +
        ". Set OKTA_CLIENT_MODE=" +
        request.clientMode +
        " in .env for pnpm approve/deny.",
    );
    return { resolved: false, reason };
  }

  let precondition: (() => Promise<{ ok: boolean; reason?: string }>) | undefined;
  let executor: (() => Promise<void>) | undefined;

  if (request.tool === "revoke_access") {
    const userId = asString(request.args.userId, "userId");
    const { groupId, groupName } = resolveStoredGroupArgs(request.args);
    precondition = async () => {
      const u = await params.client.getUser(userId);
      return {
        ok: !!u && u.groups.includes(groupId),
        reason: "user no longer a member of " + groupName,
      };
    };
    executor = async () => {
      assertDemoGroupAllowed(groupId, params.allowedGroupId);
      await params.client.removeUserFromGroup(userId, groupId);
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

  let result: ResolveResult;
  try {
    result = await resolvePending({
      dir: params.dir,
      requestId: params.requestId,
      decision: params.decision,
      approverCredential: params.approverCredential,
      expectedCredential: params.expectedCredential,
      now: params.now,
      precondition,
      executor,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
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
        decision: "executor-error",
        approverCredential: fingerprintCredential(params.approverCredential),
        oktaSummary: "executor error: " + message,
      },
      { now: params.now, signingKey: params.signingKey },
    );
    throw err;
  }

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
      { now: params.now, signingKey: params.signingKey },
    );
  }

  return result;
}
