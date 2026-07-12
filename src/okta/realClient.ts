import okta from "@okta/okta-sdk-nodejs";
import type { OktaConfig } from "../config/oktaConfig.js";
import { assertDemoGroupAllowed } from "../policy/demoGroupAllowlist.js";
import type { OktaClient, OktaUser, ResolvedGroup } from "./client.js";
import {
  ForbiddenError,
  httpStatus,
  mapOktaSdkError,
  NotFoundError,
} from "./errors.js";
import { isOktaGroupId } from "./groupId.js";

/** Real client plus read helpers used by the smoke script. */
export type RealOktaClient = OktaClient & {
  listUserGroups(userId: string): Promise<string[]>;
  assignUserToGroup(groupId: string, userId: string): Promise<void>;
  unassignUserFromGroup(groupId: string, userId: string): Promise<void>;
};

function mapUser(
  user: {
    id?: string;
    status?: string;
    profile?: { login?: string | null; displayName?: string | null };
  },
  groups: string[],
): OktaUser {
  return {
    id: user.id ?? "",
    status: user.status ?? "UNKNOWN",
    login: user.profile?.login ?? "",
    displayName: user.profile?.displayName ?? "",
    groups,
  };
}

/**
 * Live Okta Management API client (scoped OAuth private key).
 * All logging must go to stderr in callers; this module does not log secrets.
 */
export function createRealOktaClient(config: OktaConfig): RealOktaClient {
  const sdk = new okta.Client({
    orgUrl: config.orgUrl,
    authorizationMode: "PrivateKey",
    clientId: config.oauthClientId,
    scopes: config.scopes,
    privateKey: config.privateKeyPem,
    ...(config.oauthKeyId ? { keyId: config.oauthKeyId } : {}),
  });

  async function listUserGroups(userId: string): Promise<string[]> {
    try {
      const collection = await sdk.userApi.listUserGroups({ userId });
      const ids: string[] = [];
      for await (const group of collection) {
        if (group?.id) {
          ids.push(group.id);
        }
      }
      return ids;
    } catch (err: unknown) {
      throw mapOktaSdkError(err);
    }
  }

  async function getUser(userId: string): Promise<OktaUser | null> {
    try {
      const user = await sdk.userApi.getUser({ userId });
      const groups = await listUserGroups(user.id ?? userId);
      return mapUser(user, groups);
    } catch (err: unknown) {
      const mapped = mapOktaSdkError(err);
      if (mapped instanceof NotFoundError) {
        return null;
      }
      // STAGED users may return HTTP 400 for login-as-userId; resolve by login search.
      if (httpStatus(err) === 400 && userId.includes("@")) {
        try {
          const collection = await sdk.userApi.listUsers({
            search: 'profile.login eq "' + userId + '"',
          });
          let resolved: Awaited<ReturnType<typeof sdk.userApi.getUser>> | null =
            null;
          for await (const candidate of collection) {
            if (candidate?.profile?.login === userId) {
              resolved = candidate;
              break;
            }
          }
          if (!resolved?.id) {
            return null;
          }
          const groups = await listUserGroups(resolved.id);
          return mapUser(resolved, groups);
        } catch (searchErr: unknown) {
          throw mapOktaSdkError(searchErr);
        }
      }
      throw mapped;
    }
  }

  async function provisionUser(profile: {
    login: string;
    displayName: string;
  }): Promise<OktaUser> {
    try {
      const created = await sdk.userApi.createUser({
        body: {
          profile: {
            login: profile.login,
            email: profile.login,
            displayName: profile.displayName,
          },
        },
        activate: false,
      });
      return mapUser(created, []);
    } catch (err: unknown) {
      throw mapOktaSdkError(err);
    }
  }

  async function assignUserToGroup(
    groupId: string,
    userId: string,
  ): Promise<void> {
    assertDemoGroupAllowed(groupId, config.oktaDemoGroupId);
    try {
      await sdk.groupApi.assignUserToGroup({ groupId, userId });
    } catch (err: unknown) {
      throw mapOktaSdkError(err);
    }
  }

  async function unassignUserFromGroup(
    groupId: string,
    userId: string,
  ): Promise<void> {
    assertDemoGroupAllowed(groupId, config.oktaDemoGroupId);
    try {
      await sdk.groupApi.unassignUserFromGroup({ groupId, userId });
    } catch (err: unknown) {
      throw mapOktaSdkError(err);
    }
  }

  async function resolveGroup(nameOrId: string): Promise<ResolvedGroup | null> {
    try {
      if (isOktaGroupId(nameOrId)) {
        const group = await sdk.groupApi.getGroup({ groupId: nameOrId });
        const name = group.profile?.name;
        if (!group.id || !name) {
          return null;
        }
        return { id: group.id, name };
      }

      const collection = await sdk.groupApi.listGroups({
        search: 'profile.name eq "' + nameOrId + '"',
      });
      for await (const group of collection) {
        if (group?.profile?.name === nameOrId && group.id) {
          return { id: group.id, name: group.profile.name };
        }
      }
      return null;
    } catch (err: unknown) {
      const mapped = mapOktaSdkError(err);
      if (mapped instanceof NotFoundError) {
        return null;
      }
      throw mapped;
    }
  }

  return {
    getUser,
    listUserGroups,
    assignUserToGroup,
    unassignUserFromGroup,
    resolveGroup,

    async provisionUser(profile) {
      return provisionUser(profile);
    },

    async addUserToGroup(userId: string, group: string) {
      assertDemoGroupAllowed(group, config.oktaDemoGroupId);
      const groups = await listUserGroups(userId);
      if (groups.includes(group)) {
        return { added: false };
      }
      await assignUserToGroup(group, userId);
      return { added: true };
    },

    async removeUserFromGroup(userId: string, group: string) {
      assertDemoGroupAllowed(group, config.oktaDemoGroupId);
      try {
        const groups = await listUserGroups(userId);
        if (!groups.includes(group)) {
          return { removed: false };
        }
        await unassignUserFromGroup(group, userId);
        return { removed: true };
      } catch (err: unknown) {
        const mapped = mapOktaSdkError(err);
        if (mapped instanceof NotFoundError) {
          throw new Error("user not found");
        }
        throw mapped;
      }
    },

    async deactivateUser(userId: string) {
      try {
        const existing = await getUser(userId);
        if (!existing) {
          throw new Error("user not found");
        }
        if (existing.status === "DEPROVISIONED" || existing.status === "DEACTIVATED") {
          return { deactivated: false };
        }
        await sdk.userApi.deactivateUser({ userId });
        return { deactivated: true };
      } catch (err: unknown) {
        if (err instanceof Error && err.message === "user not found") {
          throw err;
        }
        const mapped = mapOktaSdkError(err);
        if (mapped instanceof NotFoundError) {
          throw new Error("user not found");
        }
        throw mapped;
      }
    },
  };
}

export { ForbiddenError, NotFoundError };
