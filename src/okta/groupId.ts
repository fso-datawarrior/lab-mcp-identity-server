/** Okta group id format (e.g. 00g153y1h2ynu2Ynd698). */
export const OKTA_GROUP_ID_PATTERN = /^00g[a-zA-Z0-9]+$/;

export function isOktaGroupId(value: string): boolean {
  return OKTA_GROUP_ID_PATTERN.test(value);
}
