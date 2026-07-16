import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifyChain } from "../src/audit/log.js";
import type { AuditEntry } from "../src/audit/types.js";
import { createMockOktaClient } from "../src/okta/mockClient.js";
import { handleRevokeAccess } from "../src/tools/revokeAccess.js";

describe("revoke_access unexpected errors", () => {
  let tempDir: string;
  let auditPath: string;
  let pendingPathAsFile: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "revoke-unmapped-"));
    auditPath = join(tempDir, "audit.jsonl");
    pendingPathAsFile = join(tempDir, "pending-not-a-dir");
    await writeFile(pendingPathAsFile, "not-a-directory\n", "utf8");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("audits and rethrows when pending store write fails unexpectedly", async () => {
    const client = createMockOktaClient();

    await expect(
      handleRevokeAccess(
        {
          client,
          auditPath,
          pendingDir: pendingPathAsFile,
          actorFingerprint: "test-fp",
          principal: "test-principal",
          now: "2026-03-15T00:00:00.000Z",
        },
        {
          userId: "user-alice",
          group: "Engineering",
          justification: "offboard",
        },
      ),
    ).rejects.toThrow();

    const content = await readFile(auditPath, "utf8");
    const lines = content
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as AuditEntry);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    const denied = lines.find(
      (l) =>
        l.decision === "denied" &&
        typeof l.oktaSummary === "string" &&
        l.oktaSummary.startsWith("unexpected error:"),
    );
    expect(denied).toBeDefined();
    expect(await verifyChain(auditPath)).toEqual({ ok: true });
  });
});
