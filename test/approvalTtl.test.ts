import { afterEach, describe, expect, it } from "vitest";
import { readApprovalTtlSeconds } from "../src/config/approvalTtl.js";

describe("readApprovalTtlSeconds", () => {
  const prev = process.env.LAB3_APPROVAL_TTL_SECONDS;

  afterEach(() => {
    if (prev === undefined) {
      delete process.env.LAB3_APPROVAL_TTL_SECONDS;
    } else {
      process.env.LAB3_APPROVAL_TTL_SECONDS = prev;
    }
  });

  it("defaults to 300 when LAB3_APPROVAL_TTL_SECONDS is unset", () => {
    delete process.env.LAB3_APPROVAL_TTL_SECONDS;
    expect(readApprovalTtlSeconds()).toBe(300);
  });

  it("honors LAB3_APPROVAL_TTL_SECONDS when set to a positive integer", () => {
    process.env.LAB3_APPROVAL_TTL_SECONDS = "900";
    expect(readApprovalTtlSeconds()).toBe(900);
  });

  it("rejects non-positive values", () => {
    process.env.LAB3_APPROVAL_TTL_SECONDS = "0";
    expect(() => readApprovalTtlSeconds()).toThrow(/positive integer/);
  });
});
