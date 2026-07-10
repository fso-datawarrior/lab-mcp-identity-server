export type AuditEntry = {
  timestamp: string;
  tool: string;
  tier: 1 | 2 | 3;
  actorFingerprint: string;
  principal: string;
  targetUser: string | null;
  args: Record<string, unknown>;
  justification: string | null;
  decision:
    | "executed"
    | "pending"
    | "approved"
    | "denied"
    | "expired"
    | "drift-failed";
  approverCredential: string | null;
  oktaSummary: string | null;
  prevHash: string;
  entryHash: string;
};
