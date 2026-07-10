export interface OktaUser {
  id: string;
  status: string;
  login: string;
  displayName: string;
  groups: string[];
}

export interface OktaClient {
  getUser(userId: string): Promise<OktaUser | null>;
}
