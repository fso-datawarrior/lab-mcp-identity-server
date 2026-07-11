import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { OktaClient } from "./okta/client.js";
import { handleDeactivateUser } from "./tools/deactivateUser.js";
import { handleGetUser } from "./tools/getUser.js";
import { handleGrantAccess } from "./tools/grantAccess.js";
import { handleProvisionUser } from "./tools/provisionUser.js";
import { handleRevokeAccess } from "./tools/revokeAccess.js";

/** Exact MCP tool names registered by createServer. No approve/deny/resolve. */
export const REGISTERED_TOOL_NAMES: string[] = [
  "get_user",
  "provision_user",
  "grant_access",
  "revoke_access",
  "deactivate_user",
];

export type ServerDeps = {
  client: OktaClient;
  auditPath: string;
  pendingDir: string;
  actorFingerprint: string;
  principal: string;
  ttlSeconds?: number;
};

/**
 * Build the MCP server with identity tools. Resolution is never registered.
 */
export function createServer(deps: ServerDeps): McpServer {
  const server = new McpServer({
    name: "lab-mcp-identity-server",
    version: "0.1.0",
  });

  const toolDeps = {
    client: deps.client,
    auditPath: deps.auditPath,
    pendingDir: deps.pendingDir,
    actorFingerprint: deps.actorFingerprint,
    principal: deps.principal,
    ttlSeconds: deps.ttlSeconds,
  };

  server.registerTool(
    "get_user",
    {
      description:
        "Look up an Okta user by id. Returns a sanitized profile or not-found.",
      inputSchema: {
        userId: z.string().describe("Okta user id to look up"),
      },
    },
    async ({ userId }) => {
      const result = await handleGetUser(toolDeps, { userId });
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
      const result = await handleProvisionUser(toolDeps, {
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
        "Add a user to a group. Normal groups are Tier 2; protected groups are Tier 3 and fail closed until gated.",
      inputSchema: {
        userId: z.string().describe("Okta user id"),
        group: z.string().describe("Group name"),
        justification: z.string().describe("Required justification"),
      },
    },
    async ({ userId, group, justification }) => {
      const result = await handleGrantAccess(toolDeps, {
        userId,
        group,
        justification,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    },
  );

  server.registerTool(
    "revoke_access",
    {
      description:
        "Request revoke of group membership (Tier 3). Creates a pending approval; does not execute.",
      inputSchema: {
        userId: z.string().describe("Okta user id"),
        group: z.string().describe("Group name"),
        justification: z.string().describe("Required justification"),
      },
    },
    async ({ userId, group, justification }) => {
      const result = await handleRevokeAccess(toolDeps, {
        userId,
        group,
        justification,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    },
  );

  server.registerTool(
    "deactivate_user",
    {
      description:
        "Request user deactivation (Tier 3). Creates a pending approval; does not execute.",
      inputSchema: {
        userId: z.string().describe("Okta user id"),
        justification: z.string().describe("Required justification"),
      },
    },
    async ({ userId, justification }) => {
      const result = await handleDeactivateUser(toolDeps, {
        userId,
        justification,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    },
  );

  return server;
}
