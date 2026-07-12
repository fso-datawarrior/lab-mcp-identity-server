import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DEFAULT_AUDIT_PATH } from "./audit/log.js";
import { DEFAULT_PENDING_DIR } from "./approval/pendingStore.js";
import { deriveActorFingerprint } from "./identity/actor.js";
import { getOktaClient } from "./okta/factory.js";
import { createServer } from "./server.js";

// stdio transport: ALL runtime logging must go to stderr, never stdout.
// stdout is reserved for the MCP protocol stream.
// Env is supplied by the host (e.g. Node --env-file); no dotenv parsing here.

async function main(): Promise<void> {
  const principal = process.env.LAB3_PRINCIPAL?.trim() || "claude-desktop";
  const actorFingerprint = deriveActorFingerprint(principal);
  const signingKey = process.env.LAB3_AUDIT_HMAC_KEY || undefined;

  const { client, allowedGroupId } = await getOktaClient();
  const server = createServer({
    client,
    auditPath: DEFAULT_AUDIT_PATH,
    pendingDir: DEFAULT_PENDING_DIR,
    actorFingerprint,
    principal,
    signingKey,
    allowedGroupId,
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    "[lab3] MCP stdio server listening (principal=" +
      principal +
      ", get_user, provision_user, grant_access, revoke_access, deactivate_user)",
  );
}

main().catch((err: unknown) => {
  console.error("[lab3] fatal:", err);
  process.exit(1);
});
