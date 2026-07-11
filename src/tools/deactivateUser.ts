import { appendAudit } from "../audit/log.js";
import { createPending } from "../approval/pendingStore.js";

export type DeactivateUserDeps = {
  auditPath: string;
  pendingDir: string;
  actorFingerprint: string;
  principal: string;
  now?: string;
  ttlSeconds?: number;
};

export type DeactivateUserArgs = {
  userId: string;
  justification: string;
};

export type DeactivateUserResult = {
  status: "pending";
  requestId: string;
};

/**
 * Tier 3 deactivate: create a durable pending request only. Never executes.
 */
export async function handleDeactivateUser(
  deps: DeactivateUserDeps,
  args: DeactivateUserArgs,
): Promise<DeactivateUserResult> {
  const now = deps.now ?? new Date().toISOString();
  const pending = await createPending(
    deps.pendingDir,
    {
      tool: "deactivate_user",
      args: { userId: args.userId },
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
      tool: "deactivate_user",
      tier: 3,
      actorFingerprint: deps.actorFingerprint,
      principal: deps.principal,
      targetUser: args.userId,
      args: { userId: args.userId },
      justification: args.justification,
      decision: "pending",
      approverCredential: null,
      oktaSummary: "deactivate pending approval for " + args.userId,
    },
    deps.now !== undefined ? { now: deps.now } : undefined,
  );

  return { status: "pending", requestId: pending.requestId };
}
