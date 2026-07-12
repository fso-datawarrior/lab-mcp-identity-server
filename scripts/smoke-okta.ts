/**
 * Live Okta smoke test (non-destructive, self-restoring).
 * Requires OKTA_CLIENT_MODE=real and populated .env.
 */
import { loadOktaConfig } from "../src/config/oktaConfig.js";
import { createRealOktaClient } from "../src/okta/realClient.js";

const ALICE_LOGIN = "lab3-demo-alice@example.com";
const BOB_LOGIN = "lab3-demo-bob@example.com";

type StepResult = { name: string; pass: boolean; detail: string };

function fail(steps: StepResult[], err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  console.error("[smoke] FATAL:", message);
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  printSummary(steps);
  process.exit(1);
}

function printSummary(steps: StepResult[]): void {
  console.error("\n=== smoke:okta summary ===");
  for (const step of steps) {
    console.error(
      (step.pass ? "PASS" : "FAIL") + "  " + step.name + ": " + step.detail,
    );
  }
  const allPass = steps.length > 0 && steps.every((s) => s.pass);
  console.error(allPass ? "\nOVERALL: PASS" : "\nOVERALL: FAIL");
}

async function main(): Promise<void> {
  const steps: StepResult[] = [];

  if ((process.env.OKTA_CLIENT_MODE ?? "mock").trim().toLowerCase() !== "real") {
    fail(steps, new Error("OKTA_CLIENT_MODE must be real for smoke:okta"));
  }

  let config;
  try {
    config = await loadOktaConfig();
  } catch (err: unknown) {
    fail(steps, err);
  }

  const client = createRealOktaClient(config);
  const demoGroupId = config.oktaDemoGroupId;

  // Step 1: getUser alice and bob (expect STAGED)
  let alice;
  let bob;
  try {
    alice = await client.getUser(ALICE_LOGIN);
    bob = await client.getUser(BOB_LOGIN);
  } catch (err: unknown) {
    fail(steps, err);
  }

  if (!alice || !bob) {
    const missing = [!alice ? ALICE_LOGIN : null, !bob ? BOB_LOGIN : null]
      .filter(Boolean)
      .join(", ");
    steps.push({
      name: "step1-getUser",
      pass: false,
      detail: "missing user(s): " + missing,
    });
    printSummary(steps);
    process.exit(1);
  }

  const aliceStaged = alice.status === "STAGED";
  const bobStaged = bob.status === "STAGED";
  console.error(
    "[step1] alice id=" +
      alice.id +
      " status=" +
      alice.status +
      (aliceStaged ? " (expected STAGED)" : " (unexpected status)"),
  );
  console.error(
    "[step1] bob id=" +
      bob.id +
      " status=" +
      bob.status +
      (bobStaged ? " (expected STAGED)" : " (unexpected status)"),
  );
  steps.push({
    name: "step1-getUser",
    pass: aliceStaged && bobStaged,
    detail:
      "alice=" +
      alice.status +
      ", bob=" +
      bob.status +
      (aliceStaged && bobStaged ? "" : " (expected both STAGED)"),
  });

  // Step 2: alice in demo group
  let aliceGroups: string[] = [];
  try {
    aliceGroups = await client.listUserGroups(alice.id);
  } catch (err: unknown) {
    fail(steps, err);
  }
  const aliceInDemo = aliceGroups.includes(demoGroupId);
  console.error(
    "[step2] alice groups: " +
      aliceGroups.join(", ") +
      " | demo group present: " +
      aliceInDemo,
  );
  steps.push({
    name: "step2-alice-in-demo-group",
    pass: aliceInDemo,
    detail: aliceInDemo
      ? "OKTA_DEMO_GROUP_ID present"
      : "OKTA_DEMO_GROUP_ID absent",
  });

  // Step 3: bob NOT in demo group
  let bobGroups: string[] = [];
  try {
    bobGroups = await client.listUserGroups(bob.id);
  } catch (err: unknown) {
    fail(steps, err);
  }
  const bobNotInDemo = !bobGroups.includes(demoGroupId);
  console.error(
    "[step3] bob groups: " +
      bobGroups.join(", ") +
      " | demo group absent: " +
      bobNotInDemo,
  );
  steps.push({
    name: "step3-bob-not-in-demo-group",
    pass: bobNotInDemo,
    detail: bobNotInDemo
      ? "OKTA_DEMO_GROUP_ID absent as expected"
      : "OKTA_DEMO_GROUP_ID unexpectedly present",
  });

  // Step 4: assign bob, verify, unassign, verify restored
  let step4Pass = false;
  let step4Detail = "";
  try {
    await client.assignUserToGroup(demoGroupId, bob.id);
    const afterAssign = await client.listUserGroups(bob.id);
    const assigned = afterAssign.includes(demoGroupId);
    if (!assigned) {
      step4Pass = false;
      step4Detail = "assign succeeded but group not listed afterward";
    } else {
      await client.unassignUserFromGroup(demoGroupId, bob.id);
      const afterUnassign = await client.listUserGroups(bob.id);
      const restored = !afterUnassign.includes(demoGroupId);
      step4Pass = restored;
      step4Detail = restored
        ? "assign verified, unassign restored original state"
        : "unassign did not remove demo group";
    }
  } catch (err: unknown) {
    step4Pass = false;
    step4Detail = err instanceof Error ? err.message : String(err);
  }
  console.error("[step4] " + step4Detail);
  steps.push({
    name: "step4-assign-unassign-restore",
    pass: step4Pass,
    detail: step4Detail,
  });

  // Step 5: tool-layer group resolution
  let step5Pass = false;
  let step5Detail = "";
  try {
    const byName = await client.resolveGroup("lab3-demo-group");
    const byId = await client.resolveGroup(demoGroupId);
    const nameOk = byName?.id === demoGroupId;
    const idOk =
      byId?.id === demoGroupId && byId?.name === "lab3-demo-group";
    step5Pass = nameOk && idOk;
    step5Detail = step5Pass
      ? "name->id and id->name both resolve to demo group"
      : "byName=" +
        JSON.stringify(byName) +
        " byId=" +
        JSON.stringify(byId) +
        " expected id=" +
        demoGroupId;
  } catch (err: unknown) {
    step5Pass = false;
    step5Detail = err instanceof Error ? err.message : String(err);
  }
  console.error("[step5] " + step5Detail);
  steps.push({
    name: "step5-tool-layer-resolution",
    pass: step5Pass,
    detail: step5Detail,
  });

  printSummary(steps);
  if (!steps.every((s) => s.pass)) {
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error("[smoke] unhandled:", err);
  process.exit(1);
});
