import { afterEach, describe, expect, it } from "vitest";
import { getOktaClient, resetOktaClientCache } from "../src/okta/factory.js";

describe("okta factory CLI/server path", () => {
  const prevMode = process.env.OKTA_CLIENT_MODE;

  afterEach(() => {
    resetOktaClientCache();
    if (prevMode === undefined) {
      delete process.env.OKTA_CLIENT_MODE;
    } else {
      process.env.OKTA_CLIENT_MODE = prevMode;
    }
  });

  it("defaults to mock client when OKTA_CLIENT_MODE is unset", async () => {
    delete process.env.OKTA_CLIENT_MODE;
    resetOktaClientCache();

    const { client, allowedGroupId } = await getOktaClient();
    const user = await client.getUser("user-alice");

    expect(user?.login).toBe("alice@example.com");
    expect(allowedGroupId).toBeUndefined();
  });
});
