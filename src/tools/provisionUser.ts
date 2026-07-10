import { appendAudit } from "../audit/log.js";
import type { OktaClient } from "../okta/client.js";
import { sanitizeUser } from "../safety/sanitize.js";

export type ProvisionUserDeps = {
  client: OktaClient;
  auditPath: string;
  actorFingerprint: string;
  principal: string;
  now?: string;
};

export type ProvisionUserArgs = {
  login: string;
  displayName: string;
  justification?: string | null;
};

export type ProvisionUserResult = {
  provisioned: true;
  user: ReturnType<typeof sanitizeUser>;
};

/**
 * Tier-2 provision: create a STAGED user and audit the call.
 */
export async function handleProvisionUser(
  deps: ProvisionUserDeps,
  args: ProvisionUserArgs,
): Promise<ProvisionUserResult> {
  const timestamp = deps.now ?? new Date().toISOString();
  const created = await deps.client.provisionUser({
    login: args.login,
    displayName: args.displayName,
  });

  await appendAudit(
    deps.auditPath,
    {
      timestamp,
      tool: "provision_user",
      tier: 2,
      actorFingerprint: deps.actorFingerprint,
      principal: deps.principal,
      targetUser: created.id,
      args: { login: args.login, displayName: args.displayName },
      justification: args.justification ?? null,
      decision: "executed",
      approverCredential: null,
      oktaSummary: "provisioned STAGED user " + created.id,
    },
    deps.now !== undefined ? { now: deps.now } : undefined,
  );

  return { provisioned: true, user: sanitizeUser(created) };
}
