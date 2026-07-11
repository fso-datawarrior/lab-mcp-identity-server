import { DEFAULT_AUDIT_PATH } from "../audit/log.js";
import { DEFAULT_PENDING_DIR } from "../approval/pendingStore.js";
import { resolveApproval } from "../approval/resolveApproval.js";
import { createMockOktaClient } from "../okta/mockClient.js";

/**
 * Out-of-band approval CLI. Not an MCP tool.
 * Usage: resolve.ts <approve|deny> <requestId>
 * Credential: process.env.APPROVAL_SECRET
 * Optional audit HMAC: process.env.LAB3_AUDIT_HMAC_KEY
 */
async function main(): Promise<void> {
  const decisionArg = process.argv[2];
  const requestId = process.argv[3];

  if (decisionArg !== "approve" && decisionArg !== "deny") {
    console.error("usage: resolve.ts <approve|deny> <requestId>");
    process.exit(1);
  }
  if (!requestId) {
    console.error("usage: resolve.ts <approve|deny> <requestId>");
    process.exit(1);
  }

  const secret = process.env.APPROVAL_SECRET;
  if (!secret) {
    console.error("APPROVAL_SECRET is unset; cannot resolve approval");
    process.exit(1);
  }

  const signingKey = process.env.LAB3_AUDIT_HMAC_KEY || undefined;

  const result = await resolveApproval({
    dir: DEFAULT_PENDING_DIR,
    auditPath: DEFAULT_AUDIT_PATH,
    requestId,
    decision: decisionArg,
    approverCredential: secret,
    expectedCredential: secret,
    now: new Date().toISOString(),
    client: createMockOktaClient(),
    signingKey,
  });

  console.log(JSON.stringify(result));
  process.exit(result.resolved ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error("[lab3] resolve CLI fatal:", err);
  process.exit(1);
});
