import { appendAudit } from "../audit/log.js";
import type { OktaClient } from "../okta/client.js";
import { classifyGrantTier } from "../policy/protectedGroups.js";

export type GrantAccessDeps = {
  client: OktaClient;
  auditPath: string;
  actorFingerprint: string;
  principal: string;
  now?: string;
  signingKey?: string;
};

export type GrantAccessArgs = {
  userId: string;
  group: string;
  justification: string;
};

export type GrantAccessResult =
  | { granted: false; requiresApproval: true }
  | { granted: false; reason: "user not found" }
  | { granted: true; alreadyMember: boolean };

/**
 * Grant group membership. Tier 2 executes; Tier 3 (protected) fails closed until M3.
 */
export async function handleGrantAccess(
  deps: GrantAccessDeps,
  args: GrantAccessArgs,
): Promise<GrantAccessResult> {
  const timestamp = deps.now ?? new Date().toISOString();
  const tier = classifyGrantTier(args.group);
  const auditOpts = { now: deps.now, signingKey: deps.signingKey };

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
        args: { userId: args.userId, group: args.group },
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
    const { added } = await deps.client.addUserToGroup(
      args.userId,
      args.group,
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
        args: { userId: args.userId, group: args.group },
        justification: args.justification,
        decision: "executed",
        approverCredential: null,
        oktaSummary: added
          ? "granted " + args.group
          : "already a member of " + args.group,
      },
      auditOpts,
    );

    return { granted: true, alreadyMember: !added };
  } catch (err: unknown) {
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
          args: { userId: args.userId, group: args.group },
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
