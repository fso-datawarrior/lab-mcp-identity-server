import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { DEFAULT_AUDIT_PATH } from "./audit/log.js";
import { createMockOktaClient } from "./okta/mockClient.js";
import { handleGetUser } from "./tools/getUser.js";
import { handleGrantAccess } from "./tools/grantAccess.js";
import { handleProvisionUser } from "./tools/provisionUser.js";

// stdio transport: ALL runtime logging must go to stderr, never stdout.
// stdout is reserved for the MCP protocol stream.

const client = createMockOktaClient();

const sharedDeps = {
  client,
  auditPath: DEFAULT_AUDIT_PATH,
  actorFingerprint: "local-dev-fingerprint",
  principal: "local-dev-principal",
};

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
    const result = await handleGetUser(sharedDeps, { userId });
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
);

server.registerTool(
  "provision_user",
  {
    description:
      "Provision a new Okta user in STAGED status (Tier 2, additive, audited).",
    inputSchema: {
      login: z.string().describe("User login (email)"),
      displayName: z.string().describe("Display name"),
      justification: z.string().optional().describe("Optional justification"),
    },
  },
  async ({ login, displayName, justification }) => {
    const result = await handleProvisionUser(sharedDeps, {
      login,
      displayName,
      justification: justification ?? null,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
);

server.registerTool(
  "grant_access",
  {
    description:
      "Add a user to a group. Normal groups are Tier 2; protected groups are Tier 3 and fail closed until the M3 approval gate.",
    inputSchema: {
      userId: z.string().describe("Okta user id"),
      group: z.string().describe("Group name"),
      justification: z.string().describe("Required justification"),
    },
  },
  async ({ userId, group, justification }) => {
    const result = await handleGrantAccess(sharedDeps, {
      userId,
      group,
      justification,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    "[lab3] MCP stdio server listening (get_user, provision_user, grant_access)",
  );
}

main().catch((err: unknown) => {
  console.error("[lab3] fatal:", err);
  process.exit(1);
});
