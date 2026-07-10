export const DEFAULT_PROTECTED_GROUPS: readonly string[] = [
  "Admins",
  "Administrators",
  "Super Admins",
  "lab3-demo-protected",
];

/** Env override, read once at module load (comma-separated group names). */
const ENV_PROTECTED: readonly string[] = (process.env.OKTA_PROTECTED_GROUPS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * True if group matches the default protected list, env override, or extras.
 * Matching is case-insensitive.
 */
export function isProtectedGroup(group: string, extra?: string[]): boolean {
  const needle = normalize(group);
  const candidates = [
    ...DEFAULT_PROTECTED_GROUPS,
    ...ENV_PROTECTED,
    ...(extra ?? []),
  ];
  return candidates.some((g) => normalize(g) === needle);
}

/**
 * Grant tier: 3 for protected groups (destructive-tier), else 2 (additive).
 */
export function classifyGrantTier(group: string): 2 | 3 {
  return isProtectedGroup(group) ? 3 : 2;
}
