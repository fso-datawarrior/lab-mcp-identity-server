import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifyChain } from "../src/audit/log.js";
import type { AuditEntry } from "../src/audit/types.js";
import { getPending } from "../src/approval/pendingStore.js";
import {
  fingerprintCredential,
  resolveApproval,
} from "../src/approval/resolveApproval.js";
import { createMockOktaClient } from "../src/okta/mockClient.js";
import { REGISTERED_TOOL_NAMES } from "../src/server.js";
import { handleDeactivateUser } from "../src/tools/deactivateUser.js";
import { handleRevokeAccess } from "../src/tools/revokeAccess.js";

const SECRET = "approver-secret";

describe("m3b out-of-band approval gate", () => {
  let tempDir: string;
  let pendingDir: string;
  let auditPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "m3b-"));
    pendingDir = join(tempDir, "pending");
    auditPath = join(tempDir, "audit.jsonl");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  function makeClient() {
    return createMockOktaClient();
  }

  function toolDeps(client = makeClient(), now = "2026-03-15T00:00:00.000Z") {
    return {
      client,
      auditPath,
      pendingDir,
      actorFingerprint: "ai-actor-fp",
      principal: "test-principal",
      now,
      ttlSeconds: 300,
    };
  }

  async function readAudit(): Promise<AuditEntry[]> {
    const content = await readFile(auditPath, "utf8");
    return content
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as AuditEntry);
  }

  it("revoke_access creates pending without removing membership", async () => {
    const client = makeClient();
    const deps = toolDeps(client);
    const before = await client.getUser("user-alice");
    expect(before?.groups).toContain("Engineering");

    const result = await handleRevokeAccess(deps, {
      userId: "user-alice",
      group: "Engineering",
      justification: "offboard project",
    });

    expect(result.status).toBe("pending");
    expect(result.requestId.length).toBeGreaterThan(0);

    const after = await client.getUser("user-alice");
    expect(after?.groups).toContain("Engineering");

    const lines = await readAudit();
    expect(lines).toHaveLength(1);
    expect(lines[0].tool).toBe("revoke_access");
    expect(lines[0].decision).toBe("pending");
    expect(lines[0].tier).toBe(3);
  });

  it("approve revoke removes membership and audits AI + approver fingerprints", async () => {
    const client = makeClient();
    const deps = toolDeps(client);
    const created = await handleRevokeAccess(deps, {
      userId: "user-alice",
      group: "Engineering",
      justification: "offboard project",
    });

    const result = await resolveApproval({
      dir: pendingDir,
      auditPath,
      requestId: created.requestId,
      decision: "approve",
      approverCredential: SECRET,
      expectedCredential: SECRET,
      now: "2026-03-15T00:01:00.000Z",
      client,
    });

    expect(result).toEqual({ resolved: true, status: "approved" });
    const user = await client.getUser("user-alice");
    expect(user?.groups).not.toContain("Engineering");

    const lines = await readAudit();
    expect(lines).toHaveLength(2);
    expect(lines[1].decision).toBe("approved");
    expect(lines[1].actorFingerprint).toBe("ai-actor-fp");
    expect(lines[1].approverCredential).toBe(fingerprintCredential(SECRET));
    expect(lines[1].approverCredential).not.toBeNull();
    expect(lines[1].approverCredential).not.toBe(lines[1].actorFingerprint);
    expect(await verifyChain(auditPath)).toEqual({ ok: true });
  });

  it("deny revoke leaves membership and audits denied", async () => {
    const client = makeClient();
    const deps = toolDeps(client);
    const created = await handleRevokeAccess(deps, {
      userId: "user-alice",
      group: "Engineering",
      justification: "maybe later",
    });

    const result = await resolveApproval({
      dir: pendingDir,
      auditPath,
      requestId: created.requestId,
      decision: "deny",
      approverCredential: SECRET,
      expectedCredential: SECRET,
      now: "2026-03-15T00:01:00.000Z",
      client,
    });

    expect(result).toEqual({ resolved: true, status: "denied" });
    const user = await client.getUser("user-alice");
    expect(user?.groups).toContain("Engineering");

    const lines = await readAudit();
    expect(lines).toHaveLength(2);
    expect(lines[1].decision).toBe("denied");
  });

  it("wrong credential leaves pending and writes no resolution audit", async () => {
    const client = makeClient();
    const deps = toolDeps(client);
    const created = await handleRevokeAccess(deps, {
      userId: "user-alice",
      group: "Engineering",
      justification: "offboard",
    });

    const result = await resolveApproval({
      dir: pendingDir,
      auditPath,
      requestId: created.requestId,
      decision: "approve",
      approverCredential: "wrong-secret",
      expectedCredential: SECRET,
      now: "2026-03-15T00:01:00.000Z",
      client,
    });

    expect(result).toEqual({
      resolved: false,
      reason: "invalid credential",
    });
    const user = await client.getUser("user-alice");
    expect(user?.groups).toContain("Engineering");
    expect((await getPending(pendingDir, created.requestId))?.status).toBe(
      "pending",
    );

    const lines = await readAudit();
    expect(lines).toHaveLength(1);
    expect(lines[0].decision).toBe("pending");
  });

  it("precondition drift fails closed without membership change", async () => {
    const client = makeClient();
    const deps = toolDeps(client);
    // Alice is not in Sales
    const created = await handleRevokeAccess(deps, {
      userId: "user-alice",
      group: "Sales",
      justification: "stale revoke",
    });

    const result = await resolveApproval({
      dir: pendingDir,
      auditPath,
      requestId: created.requestId,
      decision: "approve",
      approverCredential: SECRET,
      expectedCredential: SECRET,
      now: "2026-03-15T00:01:00.000Z",
      client,
    });

    expect(result.status).toBe("drift-failed");
    expect(result.resolved).toBe(true);
    const user = await client.getUser("user-alice");
    expect(user?.groups).toEqual(["Everyone", "Engineering"]);

    const lines = await readAudit();
    expect(lines).toHaveLength(2);
    expect(lines[1].decision).toBe("drift-failed");
  });

  it("deactivate_user approve deactivates; deny leaves ACTIVE", async () => {
    const client = makeClient();
    const deps = toolDeps(client);

    const denyPending = await handleDeactivateUser(deps, {
      userId: "user-bob",
      justification: "hold off",
    });
    const denied = await resolveApproval({
      dir: pendingDir,
      auditPath,
      requestId: denyPending.requestId,
      decision: "deny",
      approverCredential: SECRET,
      expectedCredential: SECRET,
      now: "2026-03-15T00:01:00.000Z",
      client,
    });
    expect(denied).toEqual({ resolved: true, status: "denied" });
    expect((await client.getUser("user-bob"))?.status).toBe("ACTIVE");

    const approvePending = await handleDeactivateUser(
      { ...deps, now: "2026-03-15T00:02:00.000Z" },
      {
        userId: "user-alice",
        justification: "offboard",
      },
    );
    const approved = await resolveApproval({
      dir: pendingDir,
      auditPath,
      requestId: approvePending.requestId,
      decision: "approve",
      approverCredential: SECRET,
      expectedCredential: SECRET,
      now: "2026-03-15T00:03:00.000Z",
      client,
    });
    expect(approved).toEqual({ resolved: true, status: "approved" });
    expect((await client.getUser("user-alice"))?.status).toBe("DEACTIVATED");
  });

  it("exposure boundary: no approve/deny/resolve/confirm MCP tools", () => {
    expect(REGISTERED_TOOL_NAMES).toEqual([
      "get_user",
      "provision_user",
      "grant_access",
      "revoke_access",
      "deactivate_user",
    ]);
    for (const forbidden of [
      "approve",
      "deny",
      "resolve",
      "confirm",
      "confirm_action",
    ]) {
      expect(REGISTERED_TOOL_NAMES).not.toContain(forbidden);
    }
  });
});
