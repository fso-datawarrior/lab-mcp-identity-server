import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DEFAULT_AUDIT_PATH } from "./audit/log.js";
import { DEFAULT_PENDING_DIR } from "./approval/pendingStore.js";
import { createMockOktaClient } from "./okta/mockClient.js";
import { createServer } from "./server.js";

// stdio transport: ALL runtime logging must go to stderr, never stdout.
// stdout is reserved for the MCP protocol stream.

const server = createServer({
  client: createMockOktaClient(),
  auditPath: DEFAULT_AUDIT_PATH,
  pendingDir: DEFAULT_PENDING_DIR,
  actorFingerprint: "local-dev-fingerprint",
  principal: "local-dev-principal",
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    "[lab3] MCP stdio server listening (get_user, provision_user, grant_access, revoke_access, deactivate_user)",
  );
}

main().catch((err: unknown) => {
  console.error("[lab3] fatal:", err);
  process.exit(1);
});
