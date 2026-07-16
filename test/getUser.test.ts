import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifyChain } from "../src/audit/log.js";
import type { AuditEntry } from "../src/audit/types.js";
import { createMockOktaClient } from "../src/okta/mockClient.js";
import { sanitizeUntrusted } from "../src/safety/sanitize.js";
import { handleGetUser } from "../src/tools/getUser.js";

describe("get_user", () => {
  let tempDir: string;
  let auditPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "get-user-"));
    auditPath = join(tempDir, "audit.jsonl");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  function deps(now = "2026-01-01T00:00:00.000Z") {
    return {
      client: createMockOktaClient(),
      auditPath,
      actorFingerprint: "test-fp",
      principal: "test-principal",
      now,
    };
  }

  it("returns sanitized normal user and writes one valid audit line", async () => {
    const result = await handleGetUser(deps(), { userId: "user-alice" });

    expect(result.found).toBe(true);
    if (!result.found) {
      return;
    }
    expect(result.user.id).toBe("user-alice");
    expect(result.user.displayName).toBe("Alice Example");
    expect(result.user.login).toBe("alice@example.com");

    const content = await readFile(auditPath, "utf8");
    const lines = content.split("\n").filter((line) => line.length > 0);
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]) as AuditEntry;
    expect(entry.tool).toBe("get_user");
    expect(entry.tier).toBe(1);
    expect(entry.decision).toBe("executed");
    expect(entry.oktaSummary).toBe("read user user-alice");

    const chain = await verifyChain(auditPath);
    expect(chain).toEqual({ ok: true });
  });

  it("strips hostile displayName injection characters and audits the read", async () => {
    const result = await handleGetUser(deps(), { userId: "user-hostile" });

    expect(result.found).toBe(true);
    if (!result.found) {
      return;
    }
    expect(result.user.displayName).not.toMatch(/[\u200B\u200C\u200D\uFEFF]/);
    expect(result.user.displayName).not.toMatch(
      /[\u0000-\u001F\u007F\u0080-\u009F]/,
    );
    expect(result.user.displayName).toContain("Alice");
    expect(result.user.displayName).toContain("Admin");

    const chain = await verifyChain(auditPath);
    expect(chain).toEqual({ ok: true });
  });

  it("returns found:false for unknown id and audits not-found", async () => {
    const result = await handleGetUser(deps(), { userId: "missing-user" });

    expect(result).toEqual({ found: false });

    const content = await readFile(auditPath, "utf8");
    const lines = content.split("\n").filter((line) => line.length > 0);
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]) as AuditEntry;
    expect(entry.oktaSummary).toBe("user not found");
    expect(entry.targetUser).toBe("missing-user");
  });

  it("sanitizeUntrusted strips controls/zero-width and truncates", () => {
    const dirty = "A\u200bB\u0007C\u0080D" + "x".repeat(300);
    const cleaned = sanitizeUntrusted(dirty, 10);
    expect(cleaned).not.toMatch(/[\u200B\u200C\u200D\uFEFF]/);
    expect(cleaned).not.toMatch(/[\u0000-\u001F\u007F\u0080-\u009F]/);
    expect(cleaned.length).toBe(10);
    expect(cleaned.startsWith("ABCD")).toBe(true);
  });

  it("sanitizeUntrusted strips bidi overrides, line/paragraph separators, and word joiner", () => {
    const dirty = "safe\u202Eevil\u202C\u2028\u2029\u2060tail";
    const cleaned = sanitizeUntrusted(dirty);
    expect(cleaned).not.toMatch(/[\u202A-\u202E\u2028\u2029\u2060]/);
    expect(cleaned).toBe("safeeviltail");
  });
});
