import {
  getOktaClientMode,
  hasRealOktaCredentials,
  loadOktaConfig,
  summarizeOktaConfig,
  type OktaConfig,
} from "../config/oktaConfig.js";
import type { OktaClient } from "./client.js";
import { createMockOktaClient } from "./mockClient.js";
import { createRealOktaClient } from "./realClient.js";

export type OktaClientBundle = {
  client: OktaClient;
  /** Set when using the real client; used for demo group confinement in tools. */
  allowedGroupId?: string;
  config?: OktaConfig;
};

let cached: OktaClientBundle | null = null;

/**
 * Returns mock unless OKTA_CLIENT_MODE=real and credentials are present.
 * Tests default to mock with no credentials.
 */
export async function getOktaClient(): Promise<OktaClientBundle> {
  if (cached) {
    return cached;
  }

  const mode = getOktaClientMode();
  if (mode === "real") {
    if (!hasRealOktaCredentials()) {
      throw new Error(
        "OKTA_CLIENT_MODE=real but required Okta configuration is missing",
      );
    }
    const config = await loadOktaConfig();
    console.error(
      "[lab3] using real Okta client: " +
        JSON.stringify(summarizeOktaConfig(config)),
    );
    cached = {
      client: createRealOktaClient(config),
      allowedGroupId: config.oktaDemoGroupId,
      config,
    };
    return cached;
  }

  cached = { client: createMockOktaClient() };
  return cached;
}

/** Reset cached client (tests only). */
export function resetOktaClientCache(): void {
  cached = null;
}
