import { createHash } from "node:crypto";

/** Stable 12-char fingerprint for an MCP actor principal (no secrets). */
export function deriveActorFingerprint(principal: string): string {
  return createHash("sha256")
    .update("lab3-actor:" + principal)
    .digest("hex")
    .slice(0, 12);
}
