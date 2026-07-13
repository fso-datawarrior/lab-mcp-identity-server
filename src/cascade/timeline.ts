import { readFile } from 'node:fs/promises';
import type { AuditEntry as Lab3AuditEntry } from '../audit/types.js';
import type {
  CascadeTimelineInput,
  CascadeTimelineJson,
  CascadeTimelineResult,
  DeprovisionMatchMethod,
  Lab1AuditEntry,
  TimelineEvent,
} from './types.js';

const SCIM_USER_PATH = /^\/scim\/v2\/Users\/([^/]+)$/;

export class CascadeTimelineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CascadeTimelineError';
  }
}

export type Lab1DeprovisionMatch = {
  entry: Lab1AuditEntry;
  matchMethod: DeprovisionMatchMethod;
};

export async function readJsonlLines<T>(filePath: string): Promise<T[]> {
  const content = await readFile(filePath, 'utf8');
  return content
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

export function findLab3ApprovedRevoke(
  entries: Lab3AuditEntry[],
  oktaUserId: string,
): Lab3AuditEntry | null {
  const matches = entries.filter(
    (entry) =>
      entry.tool === 'revoke_access' &&
      entry.decision === 'approved' &&
      entry.targetUser === oktaUserId,
  );
  if (matches.length === 0) {
    return null;
  }
  return pickLatestLab3(matches);
}

export function resolveOktaUserId(
  entries: Lab3AuditEntry[],
  userEmail: string,
  explicitOktaId?: string,
): string {
  if (explicitOktaId?.trim()) {
    return explicitOktaId.trim();
  }

  const approved = entries.filter(
    (entry) => entry.tool === 'revoke_access' && entry.decision === 'approved',
  );
  const needle = userEmail.toLowerCase();

  for (const entry of [...approved].reverse()) {
    const args = entry.args;
    const login =
      typeof args.userId === 'string'
        ? args.userId
        : typeof args.login === 'string'
          ? args.login
          : null;
    if (login && login.toLowerCase() === needle) {
      if (!entry.targetUser) {
        throw new CascadeTimelineError(
          'no Lab 3 approved revoke_access targetUser for ' + userEmail,
        );
      }
      return entry.targetUser;
    }
  }

  if (approved.length === 1) {
    if (!approved[0].targetUser) {
      throw new CascadeTimelineError(
        'no Lab 3 approved revoke_access targetUser for sole-candidate revoke',
      );
    }
    return approved[0].targetUser;
  }

  if (approved.length > 1) {
    throw new CascadeTimelineError(
      'ambiguous Lab 3 approved revoke: multiple revokes and none match ' + userEmail,
    );
  }

  throw new CascadeTimelineError(
    'no Lab 3 approved revoke_access found for ' + userEmail,
  );
}

export function buildScimIdToUserNameMap(
  entries: Lab1AuditEntry[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of entries) {
    if (entry.method !== 'PUT') {
      continue;
    }
    const userName = entry.request.userName;
    if (typeof userName !== 'string' || userName.length === 0) {
      continue;
    }
    const match = entry.path.match(SCIM_USER_PATH);
    if (match?.[1]) {
      map.set(match[1], userName);
    }
  }
  return map;
}

export function extractScimUserId(path: string): string | null {
  const match = path.match(SCIM_USER_PATH);
  return match?.[1] ?? null;
}

function isActiveFalseValue(value: unknown): boolean {
  return value === false;
}

function isObjectFormDeprovision(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as { active?: unknown };
  return record.active === false;
}

export function isDeprovisionPatch(entry: Lab1AuditEntry): boolean {
  if (entry.method !== 'PATCH') {
    return false;
  }
  const scimId = extractScimUserId(entry.path);
  if (!scimId) {
    return false;
  }
  const operations = entry.request.operations;
  if (!Array.isArray(operations)) {
    return false;
  }
  return operations.some((raw) => {
    if (!raw || typeof raw !== 'object') {
      return false;
    }
    const op = raw as { op?: string; path?: string; value?: unknown };
    const opName = String(op.op ?? '').toLowerCase();
    if (opName !== 'replace') {
      return false;
    }
    const path = String(op.path ?? '').toLowerCase();
    if (path.length > 0) {
      const isActivePath =
        path === 'active' || path.endsWith(':active') || path.includes('active');
      return isActivePath && isActiveFalseValue(op.value);
    }
    return isObjectFormDeprovision(op.value);
  });
}

function pickLatestLab1(entries: Lab1AuditEntry[]): Lab1AuditEntry {
  return entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp)).at(-1)!;
}

function pickLatestLab3(entries: Lab3AuditEntry[]): Lab3AuditEntry {
  return entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp)).at(-1)!;
}

export function findLab1Deprovision(
  entries: Lab1AuditEntry[],
  userEmail: string,
  scimUserId?: string,
): Lab1DeprovisionMatch | null {
  const deprovisionPatches = entries.filter(isDeprovisionPatch);

  if (scimUserId?.trim()) {
    const id = scimUserId.trim();
    const matches = deprovisionPatches.filter((entry) => {
      return extractScimUserId(entry.path) === id;
    });
    if (matches.length === 1) {
      return { entry: pickLatestLab1(matches), matchMethod: 'scim-id' };
    }
    if (matches.length > 1) {
      throw new CascadeTimelineError(
        'ambiguous Lab 1 deprovision: multiple active:false PATCHes match scim-id ' + id,
      );
    }
    return null;
  }

  const scimMap = buildScimIdToUserNameMap(entries);
  const needle = userEmail.toLowerCase();
  const usernameMatches = deprovisionPatches.filter((entry) => {
    const scimId = extractScimUserId(entry.path);
    if (!scimId) {
      return false;
    }
    const userName = scimMap.get(scimId);
    return userName?.toLowerCase() === needle;
  });
  if (usernameMatches.length === 1) {
    return { entry: pickLatestLab1(usernameMatches), matchMethod: 'username' };
  }
  if (usernameMatches.length > 1) {
    throw new CascadeTimelineError(
      'ambiguous Lab 1 deprovision: multiple active:false PATCHes match userName ' + userEmail,
    );
  }

  if (deprovisionPatches.length === 1) {
    return { entry: deprovisionPatches[0], matchMethod: 'sole-candidate' };
  }

  if (deprovisionPatches.length > 1) {
    throw new CascadeTimelineError(
      'ambiguous Lab 1 deprovision: ' +
        deprovisionPatches.length +
        ' active:false PATCHes and none match user ' +
        userEmail,
    );
  }

  return null;
}

export function cascadeLatencySeconds(
  lab3Timestamp: string,
  lab1Timestamp: string,
): number {
  const deltaMs = Date.parse(lab1Timestamp) - Date.parse(lab3Timestamp);
  return Math.round((deltaMs / 1000) * 10) / 10;
}

export function buildMergedTimeline(
  lab3Revoke: Lab3AuditEntry,
  lab1Deprovision: Lab1AuditEntry,
  userEmail: string,
): TimelineEvent[] {
  const events: TimelineEvent[] = [
    {
      timestamp: lab3Revoke.timestamp,
      source: 'lab3',
      label: 'revoke_access approved',
      detail: 'Okta user ' + lab3Revoke.targetUser + ' removed from demo group',
    },
    {
      timestamp: lab1Deprovision.timestamp,
      source: 'lab1',
      label: 'SCIM deprovision',
      detail: 'PATCH active:false for ' + userEmail,
    },
  ];
  return events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export async function correlateCascade(
  input: CascadeTimelineInput,
): Promise<CascadeTimelineResult> {
  const lab3Entries = await readJsonlLines<Lab3AuditEntry>(input.lab3Path);
  const lab1Entries = await readJsonlLines<Lab1AuditEntry>(input.lab1Path);

  const oktaUserId = resolveOktaUserId(
    lab3Entries,
    input.userEmail,
    input.oktaUserId,
  );

  const lab3Revoke = findLab3ApprovedRevoke(lab3Entries, oktaUserId);
  if (!lab3Revoke) {
    throw new CascadeTimelineError(
      'no Lab 3 approved revoke_access found for Okta id ' + oktaUserId,
    );
  }

  let lab1Match: Lab1DeprovisionMatch | null;
  try {
    lab1Match = findLab1Deprovision(
      lab1Entries,
      input.userEmail,
      input.scimUserId,
    );
  } catch (err: unknown) {
    if (err instanceof CascadeTimelineError) {
      throw err;
    }
    throw err;
  }

  if (!lab1Match) {
    throw new CascadeTimelineError(
      'no downstream deprovision found for ' +
        input.userEmail +
        ' - is the SCIM app wired and the user ACTIVE?',
    );
  }

  const events = buildMergedTimeline(
    lab3Revoke,
    lab1Match.entry,
    input.userEmail,
  );
  const cascadeLatencySecondsValue = cascadeLatencySeconds(
    lab3Revoke.timestamp,
    lab1Match.entry.timestamp,
  );

  return {
    userEmail: input.userEmail,
    oktaUserId,
    matchMethod: lab1Match.matchMethod,
    events,
    cascadeLatencySeconds: cascadeLatencySecondsValue,
    lab3RevokeApproved: lab3Revoke,
    lab1Deprovision: lab1Match.entry,
  };
}

export function formatTimelineHuman(result: CascadeTimelineResult): string {
  const lines: string[] = [
    'Cascade timeline for ' + result.userEmail,
    'Okta user id: ' + result.oktaUserId,
    'Match method: ' + result.matchMethod,
    '',
  ];
  for (const event of result.events) {
    lines.push(
      '[' + event.source + '] ' + event.timestamp + ' ' + event.label + ': ' + event.detail,
    );
  }
  lines.push('');
  if (result.cascadeLatencySeconds !== null) {
    lines.push('Cascade latency: ' + result.cascadeLatencySeconds + 's');
  }
  return lines.join('\n');
}

export function toTimelineJson(result: CascadeTimelineResult): CascadeTimelineJson {
  return {
    user: result.userEmail,
    oktaUserId: result.oktaUserId,
    matchMethod: result.matchMethod,
    cascadeLatencySeconds: result.cascadeLatencySeconds,
    events: result.events,
    lab3RevokeApproved: result.lab3RevokeApproved,
    lab1Deprovision: result.lab1Deprovision,
  };
}
