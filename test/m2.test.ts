import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifyChain } from "../src/audit/log.js";
import type { AuditEntry } from "../src/audit/types.js";
import { createMockOktaClient } from "../src/okta/mockClient.js";
import { handleGrantAccess } from "../src/tools/grantAccess.js";
import { handleProvisionUser } from "../src/tools/provisionUser.js";

describe("m2 provision_user and grant_access", () => {
  let tempDir: string;
  let auditPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "m2-"));
    auditPath = join(tempDir, "audit.jsonl");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  function makeDeps(now = "2026-02-01T00:00:00.000Z") {
    const client = createMockOktaClient();
    return {
      client,
      auditPath,
      actorFingerprint: "test-fp",
      principal: "test-principal",
      now,
    };
  }

  async function readAuditLines(): Promise<AuditEntry[]> {
    const content = await readFile(auditPath, "utf8");
    return content
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as AuditEntry);
  }

  it("provision_user creates a STAGED user and writes one valid audit line", async () => {
    const deps = makeDeps();
    const result = await handleProvisionUser(deps, {
      login: "carol@example.com",
      displayName: "Carol Example",
      justification: "lab onboarding",
    });

    expect(result.provisioned).toBe(true);
    expect(result.user.status).toBe("STAGED");
    expect(result.user.login).toBe("carol@example.com");
    expect(result.user.displayName).toBe("Carol Example");
    expect(result.user.groups).toEqual([]);

    const lines = await readAuditLines();
    expect(lines).toHaveLength(1);
    expect(lines[0].tool).toBe("provision_user");
    expect(lines[0].tier).toBe(2);
    expect(lines[0].decision).toBe("executed");
    expect(lines[0].oktaSummary).toBe(
      "provisioned STAGED user " + result.user.id,
    );
    expect(await verifyChain(auditPath)).toEqual({ ok: true });
  });

  it("grant_access to a normal group grants and audits executed", async () => {
    const deps = makeDeps();
    const result = await handleGrantAccess(deps, {
      userId: "user-bob",
      group: "Engineering",
      justification: "project access",
    });

    expect(result).toEqual({ granted: true, alreadyMember: false });

    const lines = await readAuditLines();
    expect(lines).toHaveLength(1);
    expect(lines[0].tool).toBe("grant_access");
    expect(lines[0].tier).toBe(2);
    expect(lines[0].decision).toBe("executed");
    expect(lines[0].oktaSummary).toBe("granted Engineering");

    const user = await deps.client.getUser("user-bob");
    expect(user?.groups).toContain("Engineering");
  });

  it("grant_access to the same normal group again is idempotent", async () => {
    const deps = makeDeps();
    await handleGrantAccess(deps, {
      userId: "user-bob",
      group: "Engineering",
      justification: "first grant",
    });
    const result = await handleGrantAccess(
      { ...deps, now: "2026-02-01T00:00:01.000Z" },
      {
        userId: "user-bob",
        group: "Engineering",
        justification: "second grant",
      },
    );

    expect(result).toEqual({ granted: true, alreadyMember: true });

    const lines = await readAuditLines();
    expect(lines).toHaveLength(2);
    expect(lines[1].decision).toBe("executed");
    expect(lines[1].oktaSummary).toBe("already a member of Engineering");
    expect(await verifyChain(auditPath)).toEqual({ ok: true });
  });

  it("grant_access to a protected group fails closed without membership", async () => {
    const deps = makeDeps();
    const before = await deps.client.getUser("user-alice");
    expect(before?.groups).not.toContain("Admins");

    const result = await handleGrantAccess(deps, {
      userId: "user-alice",
      group: "Admins",
      justification: "need admin",
    });

    expect(result).toEqual({ granted: false, requiresApproval: true });

    const after = await deps.client.getUser("user-alice");
    expect(after?.groups).not.toContain("Admins");

    const lines = await readAuditLines();
    expect(lines).toHaveLength(1);
    expect(lines[0].tool).toBe("grant_access");
    expect(lines[0].tier).toBe(3);
    expect(lines[0].decision).toBe("denied");
    expect(lines[0].oktaSummary).toBe(
      "protected group requires approval gate (M3); fail-closed",
    );
    expect(await verifyChain(auditPath)).toEqual({ ok: true });
  });

  it("grant_access for unknown user to a normal group is denied", async () => {
    const deps = makeDeps();
    const result = await handleGrantAccess(deps, {
      userId: "missing-user",
      group: "Engineering",
      justification: "oops",
    });

    expect(result).toEqual({ granted: false, reason: "user not found" });

    const lines = await readAuditLines();
    expect(lines).toHaveLength(1);
    expect(lines[0].tier).toBe(2);
    expect(lines[0].decision).toBe("denied");
    expect(lines[0].oktaSummary).toBe("user not found");
  });

  it("grant_access audits and rethrows unmapped Okta errors", async () => {
    const deps = makeDeps();
    deps.client.addUserToGroup = async () => {
      throw new Error("okta 502");
    };

    await expect(
      handleGrantAccess(deps, {
        userId: "user-bob",
        group: "Engineering",
        justification: "project access",
      }),
    ).rejects.toThrow("okta 502");

    const lines = await readAuditLines();
    expect(lines).toHaveLength(1);
    expect(lines[0].decision).toBe("denied");
    expect(lines[0].oktaSummary).toMatch(/unexpected error: okta 502/);
    expect(await verifyChain(auditPath)).toEqual({ ok: true });
  });
});
