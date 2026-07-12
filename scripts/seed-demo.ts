/**
 * Idempotent, non-destructive demo fixture setup for a live Okta Integrator org.
 * Setup script only; not an MCP tool. Requires OKTA_CLIENT_MODE=real.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import okta from "@okta/okta-sdk-nodejs";
import {
  loadOktaConfig,
  summarizeOktaConfig,
  type OktaConfig,
} from "../src/config/oktaConfig.js";
import { mapOktaSdkError } from "../src/okta/errors.js";

const DEMO_GROUP_SUFFIX = "group";
const ALICE_LOGIN_SUFFIX = "alice@example.com";
const BOB_LOGIN_SUFFIX = "bob@example.com";
const DEMO_GROUP_DESCRIPTION =
  "Lab 3 MCP identity server demonstration group (scoped fixture)";

type SummaryAction = "created" | "already-present";

type SummaryRow = {
  object: string;
  action: SummaryAction;
  id: string;
};

function requireRealMode(): void {
  if ((process.env.OKTA_CLIENT_MODE ?? "mock").trim().toLowerCase() !== "real") {
    throw new Error("OKTA_CLIENT_MODE must be real for seed:demo");
  }
}

/** Fail closed unless the value is within the demo prefix boundary. */
export function assertDemoPrefix(
  value: string,
  prefix: string,
  label: string,
): void {
  if (!value.startsWith(prefix)) {
    throw new Error(
      "prefix confinement refused " +
        label +
        ' "' +
        value +
        '": must start with "' +
        prefix +
        '"',
    );
  }
}

function demoGroupName(prefix: string): string {
  const name = prefix + DEMO_GROUP_SUFFIX;
  assertDemoPrefix(name, prefix, "group name");
  return name;
}

function aliceLogin(prefix: string): string {
  const login = prefix + ALICE_LOGIN_SUFFIX;
  assertDemoPrefix(login, prefix, "alice login");
  return login;
}

function bobLogin(prefix: string): string {
  const login = prefix + BOB_LOGIN_SUFFIX;
  assertDemoPrefix(login, prefix, "bob login");
  return login;
}

function createSdk(config: OktaConfig): okta.Client {
  return new okta.Client({
    orgUrl: config.orgUrl,
    authorizationMode: "PrivateKey",
    clientId: config.oauthClientId,
    scopes: config.scopes,
    privateKey: config.privateKeyPem,
    ...(config.oauthKeyId ? { keyId: config.oauthKeyId } : {}),
  });
}

async function findGroupByExactName(
  sdk: okta.Client,
  name: string,
): Promise<{ id: string; name: string } | null> {
  const collection = await sdk.groupApi.listGroups({
    search: 'profile.name eq "' + name + '"',
  });
  for await (const group of collection) {
    if (group?.profile?.name === name && group.id) {
      return { id: group.id, name: group.profile.name };
    }
  }
  return null;
}

async function findUserByLogin(
  sdk: okta.Client,
  login: string,
): Promise<{ id: string; status: string } | null> {
  const collection = await sdk.userApi.listUsers({
    search: 'profile.login eq "' + login + '"',
  });
  for await (const user of collection) {
    if (user?.profile?.login === login && user.id) {
      return { id: user.id, status: user.status ?? "UNKNOWN" };
    }
  }
  return null;
}

async function listUserGroupIds(
  sdk: okta.Client,
  userId: string,
): Promise<string[]> {
  const collection = await sdk.userApi.listUserGroups({ userId });
  const ids: string[] = [];
  for await (const group of collection) {
    if (group?.id) {
      ids.push(group.id);
    }
  }
  return ids;
}

function printSummary(rows: SummaryRow[]): void {
  console.error("\n=== seed:demo summary ===");
  console.error(
    padRight("object", 36) +
      padRight("action", 18) +
      "id",
  );
  for (const row of rows) {
    console.error(
      padRight(row.object, 36) +
        padRight(row.action, 18) +
        row.id,
    );
  }
}

function padRight(value: string, width: number): string {
  return value.length >= width ? value : value + " ".repeat(width - value.length);
}

async function ensureDemoGroup(
  sdk: okta.Client,
  config: OktaConfig,
): Promise<{ row: SummaryRow; groupId: string }> {
  const groupName = demoGroupName(config.lab3DemoPrefix);
  console.error("[step1] ensuring group " + groupName);

  const existing = await findGroupByExactName(sdk, groupName);
  if (existing) {
    console.error(
      "[step1] found group id=" +
        existing.id +
        " name=" +
        existing.name +
        " (already-present)",
    );
    if (existing.id !== config.oktaDemoGroupId) {
      console.error(
        "*** NOTE: group id " +
          existing.id +
          " differs from OKTA_DEMO_GROUP_ID (" +
          config.oktaDemoGroupId +
          "). Update OKTA_DEMO_GROUP_ID in your .env ***",
      );
    }
    return {
      row: {
        object: groupName,
        action: "already-present",
        id: existing.id,
      },
      groupId: existing.id,
    };
  }

  const created = await sdk.groupApi.createGroup({
    body: {
      profile: {
        name: groupName,
        description: DEMO_GROUP_DESCRIPTION,
      },
    },
  });
  if (!created.id || !created.profile?.name) {
    throw new Error("group create returned incomplete response");
  }
  console.error(
    "[step1] created group id=" +
      created.id +
      " name=" +
      created.profile.name,
  );
  if (created.id !== config.oktaDemoGroupId) {
    console.error(
      "*** NOTE: new group id " +
        created.id +
        " differs from OKTA_DEMO_GROUP_ID (" +
        config.oktaDemoGroupId +
        "). Update OKTA_DEMO_GROUP_ID in your .env ***",
    );
  }
  return {
    row: {
      object: groupName,
      action: "created",
      id: created.id,
    },
    groupId: created.id,
  };
}

async function ensureDemoUser(
  sdk: okta.Client,
  config: OktaConfig,
  login: string,
  displayName: string,
): Promise<SummaryRow> {
  assertDemoPrefix(login, config.lab3DemoPrefix, "user login");
  console.error("[step2] ensuring user " + login);

  const existing = await findUserByLogin(sdk, login);
  if (existing) {
    console.error(
      "[step2] found user id=" +
        existing.id +
        " status=" +
        existing.status +
        " (already-present; lifecycle unchanged)",
    );
    return {
      object: login,
      action: "already-present",
      id: existing.id,
    };
  }

  const created = await sdk.userApi.createUser({
    body: {
      profile: {
        login,
        email: login,
        displayName,
      },
    },
    activate: false,
  });
  if (!created.id) {
    throw new Error("user create returned no id for " + login);
  }
  console.error(
    "[step2] created user id=" +
      created.id +
      " status=" +
      (created.status ?? "STAGED"),
  );
  return {
    object: login,
    action: "created",
    id: created.id,
  };
}

async function ensureAliceMembership(
  sdk: okta.Client,
  config: OktaConfig,
  aliceId: string,
  groupId: string,
): Promise<SummaryRow> {
  assertDemoPrefix(
    config.lab3DemoPrefix + DEMO_GROUP_SUFFIX,
    config.lab3DemoPrefix,
    "demo group",
  );
  console.error(
    "[step3] ensuring alice (" +
      aliceId +
      ") is a member of demo group " +
      groupId,
  );

  const groups = await listUserGroupIds(sdk, aliceId);
  if (groups.includes(groupId)) {
    console.error("[step3] alice already a member (already-present)");
    return {
      object: "alice demo group membership",
      action: "already-present",
      id: groupId,
    };
  }

  await sdk.groupApi.assignUserToGroup({ groupId, userId: aliceId });
  console.error("[step3] added alice to demo group (created)");
  return {
    object: "alice demo group membership",
    action: "created",
    id: groupId,
  };
}

async function main(): Promise<void> {
  requireRealMode();
  const config = await loadOktaConfig();
  console.error(
    "[seed] config: " + JSON.stringify(summarizeOktaConfig(config)),
  );

  const sdk = createSdk(config);
  const summary: SummaryRow[] = [];

  try {
    const { row: groupRow, groupId } = await ensureDemoGroup(sdk, config);
    summary.push(groupRow);

    const aliceRow = await ensureDemoUser(
      sdk,
      config,
      aliceLogin(config.lab3DemoPrefix),
      "Lab3 Demo Alice",
    );
    summary.push(aliceRow);

    const bobRow = await ensureDemoUser(
      sdk,
      config,
      bobLogin(config.lab3DemoPrefix),
      "Lab3 Demo Bob",
    );
    summary.push(bobRow);

    const membershipRow = await ensureAliceMembership(
      sdk,
      config,
      aliceRow.id,
      groupId,
    );
    summary.push(membershipRow);

    console.error(
      "[step3] note: bob is intentionally NOT added to the demo group (fixture non-membership)",
    );
  } catch (err: unknown) {
    const mapped = mapOktaSdkError(err);
    console.error("[seed] FAILED:", mapped.message);
    if (mapped.stack) {
      console.error(mapped.stack);
    }
    process.exit(1);
  }

  printSummary(summary);
  console.error("\nOVERALL: PASS");
}

const isDirectRun =
  process.argv[1] !== undefined &&
  resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);

if (isDirectRun) {
  main().catch((err: unknown) => {
    console.error("[seed] unhandled:", err);
    process.exit(1);
  });
}
