import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AuditEntry } from "../src/audit/types.js";
import { isOktaGroupId, OKTA_GROUP_ID_PATTERN } from "../src/okta/groupId.js";
import { createMockOktaClient } from "../src/okta/mockClient.js";
import { handleGrantAccess } from "../src/tools/grantAccess.js";

describe("group resolution and tool-layer seams", () => {
  let tempDir: string;
  let auditPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "group-resolution-"));
    auditPath = join(tempDir, "audit.jsonl");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  async function readAuditLines(): Promise<AuditEntry[]> {
    const content = await readFile(auditPath, "utf8");
    return content
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as AuditEntry);
  }

  it("OKTA_GROUP_ID_PATTERN matches Okta-style ids", () => {
    expect(OKTA_GROUP_ID_PATTERN.test("00g153y1h2ynu2Ynd698")).toBe(true);
    expect(isOktaGroupId("00g153y1h2ynu2Ynd698")).toBe(true);
    expect(isOktaGroupId("Engineering")).toBe(false);
    expect(isOktaGroupId("lab3-demo-group")).toBe(false);
  });

  it("resolveGroup: name resolves to id in mock (id === name)", async () => {
    const client = createMockOktaClient();
    const resolved = await client.resolveGroup("Engineering");
    expect(resolved).toEqual({ id: "Engineering", name: "Engineering" });
  });

  it("resolveGroup: registry id passes through with canonical name", async () => {
    const client = createMockOktaClient({
      groupRegistry: {
        "00g-protected-admins": { id: "00g-protected-admins", name: "Admins" },
      },
    });
    const resolved = await client.resolveGroup("00g-protected-admins");
    expect(resolved).toEqual({
      id: "00g-protected-admins",
      name: "Admins",
    });
  });

  it("resolveGroup: unknown group returns null", async () => {
    const client = createMockOktaClient();
    expect(await client.resolveGroup("no-such-group")).toBeNull();
    expect(await client.resolveGroup("00gunknowngroup")).toBeNull();
  });

  it("tier bypass regression: protected group id still classifies Tier 3", async () => {
    const client = createMockOktaClient({
      groupRegistry: {
        "00g-protected-admins": { id: "00g-protected-admins", name: "Admins" },
      },
    });
    const deps = {
      client,
      auditPath,
      actorFingerprint: "test-fp",
      principal: "test-principal",
      now: "2026-07-12T00:00:00.000Z",
      allowedGroupId: "00g-protected-admins",
    };

    const before = await client.getUser("user-alice");
    expect(before?.groups).not.toContain("00g-protected-admins");

    const result = await handleGrantAccess(deps, {
      userId: "user-alice",
      group: "00g-protected-admins",
      justification: "bypass via id alias",
    });

    expect(result).toEqual({ granted: false, requiresApproval: true });

    const after = await client.getUser("user-alice");
    expect(after?.groups).not.toContain("00g-protected-admins");

    const lines = await readAuditLines();
    expect(lines).toHaveLength(1);
    expect(lines[0].tier).toBe(3);
    expect(lines[0].decision).toBe("denied");
    expect(lines[0].args).toMatchObject({
      groupId: "00g-protected-admins",
      groupName: "Admins",
    });
  });

  it("allowlist on resolved id denies non-demo group with audit", async () => {
    const client = createMockOktaClient({
      groupRegistry: {
        "00g-other-group": { id: "00g-other-group", name: "OtherGroup" },
      },
    });
    const deps = {
      client,
      auditPath,
      actorFingerprint: "test-fp",
      principal: "test-principal",
      now: "2026-07-12T00:00:00.000Z",
      allowedGroupId: "00g-demo-only",
    };

    const result = await handleGrantAccess(deps, {
      userId: "user-bob",
      group: "00g-other-group",
      justification: "wrong group id",
    });

    expect(result).toEqual({ granted: false, reason: "group not allowed" });

    const lines = await readAuditLines();
    expect(lines).toHaveLength(1);
    expect(lines[0].decision).toBe("denied");
    expect(lines[0].oktaSummary).toBe("group not in demo allowlist");
    expect(lines[0].args).toMatchObject({
      groupId: "00g-other-group",
      groupName: "OtherGroup",
    });
  });

  it("grant_access with unknown group is denied group not found", async () => {
    const client = createMockOktaClient();
    const deps = {
      client,
      auditPath,
      actorFingerprint: "test-fp",
      principal: "test-principal",
      now: "2026-07-12T00:00:00.000Z",
    };

    const result = await handleGrantAccess(deps, {
      userId: "user-bob",
      group: "missing-group",
      justification: "nope",
    });

    expect(result).toEqual({ granted: false, reason: "group not found" });
    const lines = await readAuditLines();
    expect(lines[0].oktaSummary).toBe("group not found");
  });
});
