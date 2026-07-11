import { appendAudit } from "../audit/log.js";
import { createPending } from "../approval/pendingStore.js";

export type RevokeAccessDeps = {
  auditPath: string;
  pendingDir: string;
  actorFingerprint: string;
  principal: string;
  now?: string;
  ttlSeconds?: number;
};

export type RevokeAccessArgs = {
  userId: string;
  group: string;
  justification: string;
};

export type RevokeAccessResult = {
  status: "pending";
  requestId: string;
};

/**
 * Tier 3 revoke: create a durable pending request only. Never executes.
 */
export async function handleRevokeAccess(
  deps: RevokeAccessDeps,
  args: RevokeAccessArgs,
): Promise<RevokeAccessResult> {
  const now = deps.now ?? new Date().toISOString();
  const pending = await createPending(
    deps.pendingDir,
    {
      tool: "revoke_access",
      args: { userId: args.userId, group: args.group },
      tier: 3,
      actorFingerprint: deps.actorFingerprint,
      principal: deps.principal,
      justification: args.justification,
      targetUser: args.userId,
    },
    { now, ttlSeconds: deps.ttlSeconds },
  );

  await appendAudit(
    deps.auditPath,
    {
      timestamp: now,
      tool: "revoke_access",
      tier: 3,
      actorFingerprint: deps.actorFingerprint,
      principal: deps.principal,
      targetUser: args.userId,
      args: { userId: args.userId, group: args.group },
      justification: args.justification,
      decision: "pending",
      approverCredential: null,
      oktaSummary: "revoke pending approval for group " + args.group,
    },
    deps.now !== undefined ? { now: deps.now } : undefined,
  );

  return { status: "pending", requestId: pending.requestId };
}
