import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createPending,
  getPending,
  resolvePending,
  type CreatePendingInput,
} from "../src/approval/pendingStore.js";

const EXPECTED = "approver-secret-never-held-by-model";

const baseInput: CreatePendingInput = {
  tool: "grant_access",
  args: { userId: "user-alice", group: "Admins" },
  tier: 3,
  actorFingerprint: "test-fp",
  principal: "test-principal",
  justification: "need admin for lab",
  targetUser: "user-alice",
};

describe("pendingStore", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pending-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("createPending writes a pending file that getPending returns", async () => {
    const created = await createPending(dir, baseInput, {
      now: "2026-03-01T00:00:00.000Z",
      ttlSeconds: 300,
    });

    expect(created.status).toBe("pending");
    expect(created.requestId.length).toBeGreaterThan(0);
    expect(created.expiresAt).toBe("2026-03-01T00:05:00.000Z");

    const loaded = await getPending(dir, created.requestId);
    expect(loaded).toEqual(created);
  });

  it("approve with correct credential runs executor once and sets approved", async () => {
    const created = await createPending(dir, baseInput, {
      now: "2026-03-01T00:00:00.000Z",
    });
    let calls = 0;

    const result = await resolvePending({
      dir,
      requestId: created.requestId,
      decision: "approve",
      approverCredential: EXPECTED,
      expectedCredential: EXPECTED,
      now: "2026-03-01T00:01:00.000Z",
      executor: async () => {
        calls += 1;
      },
    });

    expect(result).toEqual({ resolved: true, status: "approved" });
    expect(calls).toBe(1);
    const loaded = await getPending(dir, created.requestId);
    expect(loaded?.status).toBe("approved");
  });

  it("wrong credential does not run executor and leaves status pending", async () => {
    const created = await createPending(dir, baseInput, {
      now: "2026-03-01T00:00:00.000Z",
    });
    let calls = 0;

    const result = await resolvePending({
      dir,
      requestId: created.requestId,
      decision: "approve",
      approverCredential: "wrong",
      expectedCredential: EXPECTED,
      now: "2026-03-01T00:01:00.000Z",
      executor: async () => {
        calls += 1;
      },
    });

    expect(result).toEqual({
      resolved: false,
      reason: "invalid credential",
    });
    expect(calls).toBe(0);
    const loaded = await getPending(dir, created.requestId);
    expect(loaded?.status).toBe("pending");
  });

  it("double resolve after approve is single-use and executor stays at 1", async () => {
    const created = await createPending(dir, baseInput, {
      now: "2026-03-01T00:00:00.000Z",
    });
    let calls = 0;
    const executor = async () => {
      calls += 1;
    };

    await resolvePending({
      dir,
      requestId: created.requestId,
      decision: "approve",
      approverCredential: EXPECTED,
      expectedCredential: EXPECTED,
      now: "2026-03-01T00:01:00.000Z",
      executor,
    });

    const second = await resolvePending({
      dir,
      requestId: created.requestId,
      decision: "approve",
      approverCredential: EXPECTED,
      expectedCredential: EXPECTED,
      now: "2026-03-01T00:02:00.000Z",
      executor,
    });

    expect(second).toEqual({
      resolved: false,
      reason: "already resolved: approved",
    });
    expect(calls).toBe(1);
  });

  it("expiry marks expired and does not run executor", async () => {
    const created = await createPending(dir, baseInput, {
      now: "2026-03-01T00:00:00.000Z",
      ttlSeconds: 0,
    });
    let calls = 0;

    const result = await resolvePending({
      dir,
      requestId: created.requestId,
      decision: "approve",
      approverCredential: EXPECTED,
      expectedCredential: EXPECTED,
      now: "2026-03-01T00:00:01.000Z",
      executor: async () => {
        calls += 1;
      },
    });

    expect(result).toEqual({
      resolved: false,
      status: "expired",
      reason: "expired",
    });
    expect(calls).toBe(0);
    const loaded = await getPending(dir, created.requestId);
    expect(loaded?.status).toBe("expired");
  });

  it("precondition drift fails closed without running executor", async () => {
    const created = await createPending(dir, baseInput, {
      now: "2026-03-01T00:00:00.000Z",
    });
    let calls = 0;

    const result = await resolvePending({
      dir,
      requestId: created.requestId,
      decision: "approve",
      approverCredential: EXPECTED,
      expectedCredential: EXPECTED,
      now: "2026-03-01T00:01:00.000Z",
      precondition: async () => ({
        ok: false,
        reason: "user already removed",
      }),
      executor: async () => {
        calls += 1;
      },
    });

    expect(result).toEqual({
      resolved: true,
      status: "drift-failed",
      reason: "user already removed",
    });
    expect(calls).toBe(0);
    const loaded = await getPending(dir, created.requestId);
    expect(loaded?.status).toBe("drift-failed");
  });

  it("deny sets denied and does not run executor", async () => {
    const created = await createPending(dir, baseInput, {
      now: "2026-03-01T00:00:00.000Z",
    });
    let calls = 0;

    const result = await resolvePending({
      dir,
      requestId: created.requestId,
      decision: "deny",
      approverCredential: EXPECTED,
      expectedCredential: EXPECTED,
      now: "2026-03-01T00:01:00.000Z",
      executor: async () => {
        calls += 1;
      },
    });

    expect(result).toEqual({ resolved: true, status: "denied" });
    expect(calls).toBe(0);
    const loaded = await getPending(dir, created.requestId);
    expect(loaded?.status).toBe("denied");
  });

  it("restart survival: resolve succeeds using only the on-disk dir", async () => {
    const created = await createPending(dir, baseInput, {
      now: "2026-03-01T00:00:00.000Z",
    });
    const requestId = created.requestId;

    // Simulate a new process: no shared in-memory handle, only the dir path.
    let calls = 0;
    const result = await resolvePending({
      dir,
      requestId,
      decision: "approve",
      approverCredential: EXPECTED,
      expectedCredential: EXPECTED,
      now: "2026-03-01T00:01:00.000Z",
      executor: async () => {
        calls += 1;
      },
    });

    expect(result).toEqual({ resolved: true, status: "approved" });
    expect(calls).toBe(1);
    expect((await getPending(dir, requestId))?.status).toBe("approved");
  });

  it("normal approve still ends approved with executor called once", async () => {
    const created = await createPending(dir, baseInput, {
      now: "2026-03-01T00:00:00.000Z",
    });
    let calls = 0;

    const result = await resolvePending({
      dir,
      requestId: created.requestId,
      decision: "approve",
      approverCredential: EXPECTED,
      expectedCredential: EXPECTED,
      now: "2026-03-01T00:01:00.000Z",
      executor: async () => {
        calls += 1;
      },
    });

    expect(result).toEqual({ resolved: true, status: "approved" });
    expect(calls).toBe(1);
    expect((await getPending(dir, created.requestId))?.status).toBe("approved");
  });

  it("executor throw leaves approving limbo and blocks re-execution", async () => {
    const created = await createPending(dir, baseInput, {
      now: "2026-03-01T00:00:00.000Z",
    });
    let calls = 0;

    await expect(
      resolvePending({
        dir,
        requestId: created.requestId,
        decision: "approve",
        approverCredential: EXPECTED,
        expectedCredential: EXPECTED,
        now: "2026-03-01T00:01:00.000Z",
        executor: async () => {
          calls += 1;
          throw new Error("executor crashed");
        },
      }),
    ).rejects.toThrow("executor crashed");

    expect(calls).toBe(1);
    expect((await getPending(dir, created.requestId))?.status).toBe("approving");

    const retry = await resolvePending({
      dir,
      requestId: created.requestId,
      decision: "approve",
      approverCredential: EXPECTED,
      expectedCredential: EXPECTED,
      now: "2026-03-01T00:02:00.000Z",
      executor: async () => {
        calls += 1;
      },
    });

    expect(retry).toEqual({
      resolved: false,
      reason: "already resolved: approving",
    });
    expect(calls).toBe(1);
  });
});
