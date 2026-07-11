import { describe, expect, it } from "vitest";
import { redactSecrets } from "../src/audit/redact.js";

describe("redactSecrets recursive", () => {
  it("redacts nested object keys", () => {
    expect(
      redactSecrets({ profile: { token: "x", name: "y" } }),
    ).toEqual({ profile: { token: "[REDACTED]", name: "y" } });
  });

  it("redacts secrets inside arrays", () => {
    expect(
      redactSecrets({ items: [{ secret: "a" }, { ok: "b" }] }),
    ).toEqual({ items: [{ secret: "[REDACTED]" }, { ok: "b" }] });
  });

  it("replaces a matching key whose value is an object wholesale", () => {
    expect(
      redactSecrets({
        token: { nested: "still-secret", deeper: { password: "x" } },
        keep: "ok",
      }),
    ).toEqual({
      token: "[REDACTED]",
      keep: "ok",
    });
  });

  it("still redacts top-level matching keys", () => {
    expect(
      redactSecrets({
        token: "super-secret",
        login: "user@example.com",
        Password: "also",
      }),
    ).toEqual({
      token: "[REDACTED]",
      login: "user@example.com",
      Password: "[REDACTED]",
    });
  });
});
