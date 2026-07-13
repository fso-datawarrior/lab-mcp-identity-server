import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPending,
  getPending,
  type CreatePendingInput,
} from "../src/approval/pendingStore.js";
import { resolveApproval } from "../src/approval/resolveApproval.js";
import { createMockOktaClient } from "../src/okta/mockClient.js";

const SECRET = "approver-secret";

const revokeInput: CreatePendingInput = {
  tool: "revoke_access",
  args: {
    userId: "user-alice",
    group: "Engineering",
    groupId: "Engineering",
    groupName: "Engineering",
  },
  tier: 3,
  actorFingerprint: "ai-actor-fp",
  principal: "test-principal",
  justification: "mode mismatch test",
  targetUser: "user-alice",
};

describe("approval client mode mismatch", () => {
  let tempDir: string;
  let pendingDir: string;
  let auditPath: string;
  const prevMode = process.env.OKTA_CLIENT_MODE;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "mode-mismatch-"));
    pendingDir = join(tempDir, "pending");
    auditPath = join(tempDir, "audit.jsonl");
    delete process.env.OKTA_CLIENT_MODE;
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    if (prevMode === undefined) {
      delete process.env.OKTA_CLIENT_MODE;
    } else {
      process.env.OKTA_CLIENT_MODE = prevMode;
    }
  });

  it("refuses mock resolver for a real-stamped pending request", async () => {
    const client = createMockOktaClient();
    const created = await createPending(pendingDir, revokeInput, {
      now: "2026-07-12T00:00:00.000Z",
      clientMode: "real",
    });

    const stderr = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await resolveApproval({
      dir: pendingDir,
      auditPath,
      requestId: created.requestId,
      decision: "approve",
      approverCredential: SECRET,
      expectedCredential: SECRET,
      now: "2026-07-12T00:01:00.000Z",
      client,
    });

    expect(result).toEqual({
      resolved: false,
      reason:
        "client mode mismatch: request created in real, resolver running in mock",
    });
    expect((await getPending(pendingDir, created.requestId))?.status).toBe(
      "pending",
    );
    expect((await client.getUser("user-alice"))?.groups).toContain(
      "Engineering",
    );

    const auditContent = await readFile(auditPath, "utf8").catch(() => "");
    expect(auditContent).toBe("");
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining("approval refused"),
    );
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining("OKTA_CLIENT_MODE=real"),
    );

    stderr.mockRestore();
  });

  it("resolves normally when stamped mode matches the resolver", async () => {
    const client = createMockOktaClient();
    const created = await createPending(pendingDir, revokeInput, {
      now: "2026-07-12T00:00:00.000Z",
      clientMode: "mock",
    });

    const result = await resolveApproval({
      dir: pendingDir,
      auditPath,
      requestId: created.requestId,
      decision: "approve",
      approverCredential: SECRET,
      expectedCredential: SECRET,
      now: "2026-07-12T00:01:00.000Z",
      client,
    });

    expect(result).toEqual({ resolved: true, status: "approved" });
    expect((await client.getUser("user-alice"))?.groups).not.toContain(
      "Engineering",
    );
  });

  it("resolves legacy pending files with no clientMode stamp", async () => {
    const client = createMockOktaClient();
    const created = await createPending(pendingDir, revokeInput, {
      now: "2026-07-12T00:00:00.000Z",
      clientMode: "mock",
    });
    const legacy = { ...created };
    delete legacy.clientMode;
    await writeFile(
      join(pendingDir, created.requestId + ".json"),
      JSON.stringify(legacy, null, 2) + "\n",
      "utf8",
    );

    const result = await resolveApproval({
      dir: pendingDir,
      auditPath,
      requestId: created.requestId,
      decision: "approve",
      approverCredential: SECRET,
      expectedCredential: SECRET,
      now: "2026-07-12T00:01:00.000Z",
      client,
    });

    expect(result).toEqual({ resolved: true, status: "approved" });
  });
});
