/**
 * Demo group confinement: real Okta group operations may only target OKTA_DEMO_GROUP_ID.
 * Okta OAuth scopes cannot confine a token to one group; this check is server-side.
 */
export class DemoGroupNotAllowedError extends Error {
  readonly group: string;
  readonly allowedGroupId: string;

  constructor(group: string, allowedGroupId: string) {
    super("group not in demo allowlist: " + group);
    this.name = "DemoGroupNotAllowedError";
    this.group = group;
    this.allowedGroupId = allowedGroupId;
  }
}

/**
 * Fail closed when a group id is outside the demo allowlist.
 * No-op when allowedGroupId is unset (mock mode).
 */
export function assertDemoGroupAllowed(
  group: string,
  allowedGroupId: string | undefined,
): void {
  if (!allowedGroupId) {
    return;
  }
  if (group !== allowedGroupId) {
    throw new DemoGroupNotAllowedError(group, allowedGroupId);
  }
}
