import { appendAudit } from "../audit/log.js";
import { createPending } from "../approval/pendingStore.js";
import type { OktaClient } from "../okta/client.js";
import {
  assertDemoGroupAllowed,
  DemoGroupNotAllowedError,
} from "../policy/demoGroupAllowlist.js";

export type RevokeAccessDeps = {
  client: OktaClient;
  auditPath: string;
  pendingDir: string;
  actorFingerprint: string;
  principal: string;
  now?: string;
  ttlSeconds?: number;
  signingKey?: string;
  allowedGroupId?: string;
};

export type RevokeAccessArgs = {
  userId: string;
  group: string;
  justification: string;
};

export type RevokeAccessResult =
  | { status: "pending"; requestId: string }
  | { status: "denied"; reason: "group not found" }
  | { status: "denied"; reason: "group not allowed" };

/**
 * Tier 3 revoke: create a durable pending request only. Never executes.
 */
export async function handleRevokeAccess(
  deps: RevokeAccessDeps,
  args: RevokeAccessArgs,
): Promise<RevokeAccessResult> {
  const now = deps.now ?? new Date().toISOString();

  const resolved = await deps.client.resolveGroup(args.group);
  if (!resolved) {
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
        decision: "denied",
        approverCredential: null,
        oktaSummary: "group not found",
      },
      { now: deps.now, signingKey: deps.signingKey },
    );
    return { status: "denied", reason: "group not found" };
  }

  try {
    assertDemoGroupAllowed(resolved.id, deps.allowedGroupId);
  } catch (err: unknown) {
    if (err instanceof DemoGroupNotAllowedError) {
      await appendAudit(
        deps.auditPath,
        {
          timestamp: now,
          tool: "revoke_access",
          tier: 3,
          actorFingerprint: deps.actorFingerprint,
          principal: deps.principal,
          targetUser: args.userId,
          args: {
            userId: args.userId,
            group: args.group,
            groupId: resolved.id,
            groupName: resolved.name,
          },
          justification: args.justification,
          decision: "denied",
          approverCredential: null,
          oktaSummary: "group not in demo allowlist",
        },
        { now: deps.now, signingKey: deps.signingKey },
      );
      return { status: "denied", reason: "group not allowed" };
    }
    throw err;
  }

  const pending = await createPending(
    deps.pendingDir,
    {
      tool: "revoke_access",
      args: {
        userId: args.userId,
        group: args.group,
        groupId: resolved.id,
        groupName: resolved.name,
      },
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
      args: {
        userId: args.userId,
        group: args.group,
        groupId: resolved.id,
        groupName: resolved.name,
      },
      justification: args.justification,
      decision: "pending",
      approverCredential: null,
      oktaSummary: "revoke pending approval for group " + resolved.name,
    },
    { now: deps.now, signingKey: deps.signingKey },
  );

  return { status: "pending", requestId: pending.requestId };
}
