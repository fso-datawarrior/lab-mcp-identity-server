/**
 * Read optional LAB3_APPROVAL_TTL_SECONDS (positive integer; default 300).
 */
export function readApprovalTtlSeconds(): number {
  const raw = process.env.LAB3_APPROVAL_TTL_SECONDS?.trim();
  if (!raw) {
    return 300;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("LAB3_APPROVAL_TTL_SECONDS must be a positive integer");
  }
  return parsed;
}
