import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendAudit,
  GENESIS_HASH,
  verifyChain,
  type AppendAuditPartial,
} from "../src/audit/log.js";
import { redactSecrets } from "../src/audit/redact.js";
import type { AuditEntry } from "../src/audit/types.js";

function basePartial(
  overrides: Partial<AppendAuditPartial> = {},
): AppendAuditPartial {
  return {
    timestamp: "2026-01-01T00:00:00.000Z",
    tool: "get_user",
    tier: 1,
    actorFingerprint: "fp-test",
    principal: "agent@example.com",
    targetUser: "user@example.com",
    args: { login: "user@example.com" },
    justification: null,
    decision: "executed",
    approverCredential: null,
    oktaSummary: null,
    ...overrides,
  };
}

describe("audit", () => {
  let tempDir: string;
  let logPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "audit-"));
    logPath = join(tempDir, "audit.jsonl");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("appendAudit writes one line with genesis prevHash and non-empty entryHash", async () => {
    const entry = await appendAudit(logPath, basePartial());

    expect(entry.prevHash).toBe(GENESIS_HASH);
    expect(entry.entryHash.length).toBeGreaterThan(0);

    const content = await readFile(logPath, "utf8");
    const lines = content.split("\n").filter((line) => line.length > 0);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual(entry);
  });

  it("three sequential appends chain correctly", async () => {
    const e0 = await appendAudit(
      logPath,
      basePartial({ timestamp: "2026-01-01T00:00:00.000Z" }),
    );
    const e1 = await appendAudit(
      logPath,
      basePartial({ timestamp: "2026-01-01T00:00:01.000Z" }),
    );
    const e2 = await appendAudit(
      logPath,
      basePartial({ timestamp: "2026-01-01T00:00:02.000Z" }),
    );

    expect(e0.prevHash).toBe(GENESIS_HASH);
    expect(e1.prevHash).toBe(e0.entryHash);
    expect(e2.prevHash).toBe(e1.entryHash);
  });

  it("verifyChain returns ok:true for an intact 3-entry file", async () => {
    await appendAudit(logPath, basePartial({ timestamp: "2026-01-01T00:00:00.000Z" }));
    await appendAudit(logPath, basePartial({ timestamp: "2026-01-01T00:00:01.000Z" }));
    await appendAudit(logPath, basePartial({ timestamp: "2026-01-01T00:00:02.000Z" }));

    const result = await verifyChain(logPath);
    expect(result).toEqual({ ok: true });
  });

  it("tampering a middle entry breaks the chain at that line", async () => {
    await appendAudit(logPath, basePartial({ timestamp: "2026-01-01T00:00:00.000Z" }));
    await appendAudit(logPath, basePartial({ timestamp: "2026-01-01T00:00:01.000Z" }));
    await appendAudit(logPath, basePartial({ timestamp: "2026-01-01T00:00:02.000Z" }));

    const content = await readFile(logPath, "utf8");
    const lines = content.split("\n").filter((line) => line.length > 0);
    const middle = JSON.parse(lines[1]) as AuditEntry;
    middle.tool = "tampered_tool";
    lines[1] = JSON.stringify(middle);
    await writeFile(logPath, lines.join("\n") + "\n", "utf8");

    const result = await verifyChain(logPath);
    expect(result.ok).toBe(false);
    expect(result.brokenAtLine).toBe(2);
  });

  it("deleting a middle line breaks the chain", async () => {
    await appendAudit(logPath, basePartial({ timestamp: "2026-01-01T00:00:00.000Z" }));
    await appendAudit(logPath, basePartial({ timestamp: "2026-01-01T00:00:01.000Z" }));
    await appendAudit(logPath, basePartial({ timestamp: "2026-01-01T00:00:02.000Z" }));

    const content = await readFile(logPath, "utf8");
    const lines = content.split("\n").filter((line) => line.length > 0);
    const withoutMiddle = [lines[0], lines[2]];
    await writeFile(logPath, withoutMiddle.join("\n") + "\n", "utf8");

    const result = await verifyChain(logPath);
    expect(result.ok).toBe(false);
  });

  it("redactSecrets masks token keys and appendAudit stores [REDACTED]", async () => {
    const cleaned = redactSecrets({
      token: "super-secret",
      login: "user@example.com",
    });
    expect(cleaned.token).toBe("[REDACTED]");
    expect(cleaned.login).toBe("user@example.com");

    const entry = await appendAudit(
      logPath,
      basePartial({
        args: { token: "super-secret", login: "user@example.com" },
      }),
    );
    expect(entry.args.token).toBe("[REDACTED]");
    expect(entry.args.login).toBe("user@example.com");
  });
});
