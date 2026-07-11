import { appendAudit } from "../audit/log.js";
import type { OktaClient } from "../okta/client.js";
import { sanitizeUser } from "../safety/sanitize.js";

export type GetUserDeps = {
  client: OktaClient;
  auditPath: string;
  actorFingerprint: string;
  principal: string;
  now?: string;
  signingKey?: string;
};

export type GetUserArgs = {
  userId: string;
};

export type GetUserResult =
  | { found: false }
  | { found: true; user: ReturnType<typeof sanitizeUser> };

/**
 * Tier-1 read of an Okta user. Always writes one hash-chained audit line.
 */
export async function handleGetUser(
  deps: GetUserDeps,
  args: GetUserArgs,
): Promise<GetUserResult> {
  const timestamp = deps.now ?? new Date().toISOString();
  const user = await deps.client.getUser(args.userId);

  if (user === null) {
    await appendAudit(
      deps.auditPath,
      {
        timestamp,
        tool: "get_user",
        tier: 1,
        actorFingerprint: deps.actorFingerprint,
        principal: deps.principal,
        targetUser: args.userId,
        args: { userId: args.userId },
        justification: null,
        decision: "executed",
        approverCredential: null,
        oktaSummary: "user not found",
      },
      { now: deps.now, signingKey: deps.signingKey },
    );
    return { found: false };
  }

  await appendAudit(
    deps.auditPath,
    {
      timestamp,
      tool: "get_user",
      tier: 1,
      actorFingerprint: deps.actorFingerprint,
      principal: deps.principal,
      targetUser: user.id,
      args: { userId: args.userId },
      justification: null,
      decision: "executed",
      approverCredential: null,
      oktaSummary: "read user " + user.id,
    },
    { now: deps.now, signingKey: deps.signingKey },
  );

  return { found: true, user: sanitizeUser(user) };
}
