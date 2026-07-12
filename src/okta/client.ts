export interface OktaUser {
  id: string;
  status: string;
  login: string;
  displayName: string;
  groups: string[];
}

export type ResolvedGroup = { id: string; name: string };

export interface OktaClient {
  getUser(userId: string): Promise<OktaUser | null>;
  resolveGroup(nameOrId: string): Promise<ResolvedGroup | null>;
  provisionUser(profile: {
    login: string;
    displayName: string;
  }): Promise<OktaUser>;
  addUserToGroup(
    userId: string,
    group: string,
  ): Promise<{ added: boolean }>;
  removeUserFromGroup(
    userId: string,
    group: string,
  ): Promise<{ removed: boolean }>;
  deactivateUser(userId: string): Promise<{ deactivated: boolean }>;
}
