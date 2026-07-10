import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { DEFAULT_AUDIT_PATH } from "./audit/log.js";
import { createMockOktaClient } from "./okta/mockClient.js";
import { handleGetUser } from "./tools/getUser.js";

// stdio transport: ALL runtime logging must go to stderr, never stdout.
// stdout is reserved for the MCP protocol stream.

const client = createMockOktaClient();

const server = new McpServer({
  name: "lab-mcp-identity-server",
  version: "0.1.0",
});

server.registerTool(
  "get_user",
  {
    description: "Look up an Okta user by id. Returns a sanitized profile or not-found.",
    inputSchema: {
      userId: z.string().describe("Okta user id to look up"),
    },
  },
  async ({ userId }) => {
    const result = await handleGetUser(
      {
        client,
        auditPath: DEFAULT_AUDIT_PATH,
        actorFingerprint: "local-dev-fingerprint",
        principal: "local-dev-principal",
      },
      { userId },
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[lab3] MCP stdio server listening (get_user)");
}

main().catch((err: unknown) => {
  console.error("[lab3] fatal:", err);
  process.exit(1);
});
