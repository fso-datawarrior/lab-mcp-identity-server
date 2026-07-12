import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { redactSecrets } from "../audit/redact.js";

export type OktaClientMode = "mock" | "real";

export type OktaConfig = {
  orgUrl: string;
  oauthClientId: string;
  privateKeyPem: string;
  scopes: string[];
  oktaDemoGroupId: string;
  lab3DemoPrefix: string;
  oauthKeyId?: string;
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error("missing required configuration: " + name);
  }
  return value;
}

/**
 * Load and validate Okta configuration for the real client.
 * Reads the PEM file contents; never logs secrets.
 */
export async function loadOktaConfig(): Promise<OktaConfig> {
  const orgUrl = requireEnv("OKTA_ORG_URL");
  const oauthClientId = requireEnv("OKTA_OAUTH_CLIENT_ID");
  const keyPath = requireEnv("OKTA_OAUTH_PRIVATE_KEY_PATH");
  const scopesRaw = requireEnv("OKTA_SCOPES");
  const oktaDemoGroupId = requireEnv("OKTA_DEMO_GROUP_ID");
  const lab3DemoPrefix = requireEnv("LAB3_DEMO_PREFIX");
  const oauthKeyId = process.env.OKTA_OAUTH_KEY_ID?.trim() || undefined;

  const scopes = scopesRaw.split(/\s+/).filter((s) => s.length > 0);
  if (scopes.length === 0) {
    throw new Error("missing required configuration: OKTA_SCOPES (no scopes parsed)");
  }

  let privateKeyPem: string;
  try {
    privateKeyPem = await readFile(resolve(keyPath), "utf8");
  } catch {
    throw new Error(
      "cannot read OKTA_OAUTH_PRIVATE_KEY_PATH (file missing or unreadable)",
    );
  }
  if (!privateKeyPem.includes("BEGIN")) {
    throw new Error("OKTA_OAUTH_PRIVATE_KEY_PATH does not contain a PEM private key");
  }

  return {
    orgUrl,
    oauthClientId,
    privateKeyPem,
    scopes,
    oktaDemoGroupId,
    lab3DemoPrefix,
    oauthKeyId,
  };
}

/** Safe summary for stderr logging (redacted). */
export function summarizeOktaConfig(config: OktaConfig): Record<string, unknown> {
  return redactSecrets({
    orgUrl: config.orgUrl,
    oauthClientId: config.oauthClientId,
    scopes: config.scopes.join(" "),
    oktaDemoGroupId: config.oktaDemoGroupId,
    lab3DemoPrefix: config.lab3DemoPrefix,
    oauthKeyId: config.oauthKeyId ?? null,
    privateKeyPem: "[REDACTED]",
  });
}

export function getOktaClientMode(): OktaClientMode {
  const raw = (process.env.OKTA_CLIENT_MODE ?? "mock").trim().toLowerCase();
  if (raw === "real") {
    return "real";
  }
  if (raw !== "mock") {
    console.error(
      "[lab3] unknown OKTA_CLIENT_MODE " + raw + "; defaulting to mock",
    );
  }
  return "mock";
}

export function hasRealOktaCredentials(): boolean {
  return (
    !!process.env.OKTA_ORG_URL?.trim() &&
    !!process.env.OKTA_OAUTH_CLIENT_ID?.trim() &&
    !!process.env.OKTA_OAUTH_PRIVATE_KEY_PATH?.trim() &&
    !!process.env.OKTA_SCOPES?.trim() &&
    !!process.env.OKTA_DEMO_GROUP_ID?.trim()
  );
}
