import { appendAudit } from "../audit/log.js";
import type { OktaClient, ResolvedGroup } from "../okta/client.js";
import {
  assertDemoGroupAllowed,
  DemoGroupNotAllowedError,
} from "../policy/demoGroupAllowlist.js";
import { classifyGrantTier } from "../policy/protectedGroups.js";

export type GrantAccessDeps = {
  client: OktaClient;
  auditPath: string;
  actorFingerprint: string;
  principal: string;
  now?: string;
  signingKey?: string;
  allowedGroupId?: string;
};

export type GrantAccessArgs = {
  userId: string;
  group: string;
  justification: string;
};

export type GrantAccessResult =
  | { granted: false; requiresApproval: true }
  | { granted: false; reason: "user not found" }
  | { granted: false; reason: "group not found" }
  | { granted: false; reason: "group not allowed" }
  | { granted: true; alreadyMember: boolean };

function auditGroupArgs(
  userId: string,
  rawGroup: string,
  resolved: ResolvedGroup,
): Record<string, string> {
  return {
    userId,
    group: rawGroup,
    groupId: resolved.id,
    groupName: resolved.name,
  };
}

/**
 * Grant group membership. Tier 2 executes; Tier 3 (protected) fails closed until M3.
 */
export async function handleGrantAccess(
  deps: GrantAccessDeps,
  args: GrantAccessArgs,
): Promise<GrantAccessResult> {
  const timestamp = deps.now ?? new Date().toISOString();
  const auditOpts = { now: deps.now, signingKey: deps.signingKey };

  const resolved = await deps.client.resolveGroup(args.group);
  if (!resolved) {
    await appendAudit(
      deps.auditPath,
      {
        timestamp,
        tool: "grant_access",
        tier: 2,
        actorFingerprint: deps.actorFingerprint,
        principal: deps.principal,
        targetUser: args.userId,
        args: { userId: args.userId, group: args.group },
        justification: args.justification,
        decision: "denied",
        approverCredential: null,
        oktaSummary: "group not found",
      },
      auditOpts,
    );
    return { granted: false, reason: "group not found" };
  }

  const tier = classifyGrantTier(resolved.name);
  const groupArgs = auditGroupArgs(args.userId, args.group, resolved);

  if (tier === 3) {
    await appendAudit(
      deps.auditPath,
      {
        timestamp,
        tool: "grant_access",
        tier: 3,
        actorFingerprint: deps.actorFingerprint,
        principal: deps.principal,
        targetUser: args.userId,
        args: groupArgs,
        justification: args.justification,
        decision: "denied",
        approverCredential: null,
        oktaSummary:
          "protected group requires approval gate (M3); fail-closed",
      },
      auditOpts,
    );
    return { granted: false, requiresApproval: true };
  }

  try {
    assertDemoGroupAllowed(resolved.id, deps.allowedGroupId);

    const { added } = await deps.client.addUserToGroup(
      args.userId,
      resolved.id,
    );

    await appendAudit(
      deps.auditPath,
      {
        timestamp,
        tool: "grant_access",
        tier: 2,
        actorFingerprint: deps.actorFingerprint,
        principal: deps.principal,
        targetUser: args.userId,
        args: groupArgs,
        justification: args.justification,
        decision: "executed",
        approverCredential: null,
        oktaSummary: added
          ? "granted " + resolved.name
          : "already a member of " + resolved.name,
      },
      auditOpts,
    );

    return { granted: true, alreadyMember: !added };
  } catch (err: unknown) {
    if (err instanceof DemoGroupNotAllowedError) {
      await appendAudit(
        deps.auditPath,
        {
          timestamp,
          tool: "grant_access",
          tier: 2,
          actorFingerprint: deps.actorFingerprint,
          principal: deps.principal,
          targetUser: args.userId,
          args: groupArgs,
          justification: args.justification,
          decision: "denied",
          approverCredential: null,
          oktaSummary: "group not in demo allowlist",
        },
        auditOpts,
      );
      return { granted: false, reason: "group not allowed" };
    }

    const message = err instanceof Error ? err.message : String(err);
    if (message === "user not found") {
      await appendAudit(
        deps.auditPath,
        {
          timestamp,
          tool: "grant_access",
          tier: 2,
          actorFingerprint: deps.actorFingerprint,
          principal: deps.principal,
          targetUser: args.userId,
          args: groupArgs,
          justification: args.justification,
          decision: "denied",
          approverCredential: null,
          oktaSummary: "user not found",
        },
        auditOpts,
      );
      return { granted: false, reason: "user not found" };
    }
    throw err;
  }
}
