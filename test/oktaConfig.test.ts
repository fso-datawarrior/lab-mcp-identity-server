import { afterEach, describe, expect, it } from "vitest";
import {
  hasRealOktaCredentials,
  loadOktaConfig,
} from "../src/config/oktaConfig.js";

const KEYS = [
  "OKTA_ORG_URL",
  "OKTA_OAUTH_CLIENT_ID",
  "OKTA_OAUTH_PRIVATE_KEY_PATH",
  "OKTA_SCOPES",
  "OKTA_DEMO_GROUP_ID",
  "LAB3_DEMO_PREFIX",
] as const;

describe("oktaConfig credential guard alignment", () => {
  const saved: Partial<Record<(typeof KEYS)[number], string | undefined>> = {};

  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
      delete saved[key];
    }
  });

  function stash(key: (typeof KEYS)[number]): void {
    saved[key] = process.env[key];
  }

  it("hasRealOktaCredentials is false when LAB3_DEMO_PREFIX is missing (matches loadOktaConfig)", async () => {
    for (const key of KEYS) {
      stash(key);
    }
    process.env.OKTA_ORG_URL = "https://example.okta.com";
    process.env.OKTA_OAUTH_CLIENT_ID = "client";
    process.env.OKTA_OAUTH_PRIVATE_KEY_PATH = "/tmp/missing-key.pem";
    process.env.OKTA_SCOPES = "okta.users.read";
    process.env.OKTA_DEMO_GROUP_ID = "00gdemo";
    delete process.env.LAB3_DEMO_PREFIX;

    expect(hasRealOktaCredentials()).toBe(false);
    await expect(loadOktaConfig()).rejects.toThrow(/LAB3_DEMO_PREFIX/);
  });
});
