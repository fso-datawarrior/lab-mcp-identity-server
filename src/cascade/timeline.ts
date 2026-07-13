import { readFile } from 'node:fs/promises';
import type { AuditEntry as Lab3AuditEntry } from '../audit/types.js';
import type {
  CascadeTimelineInput,
  CascadeTimelineJson,
  CascadeTimelineResult,
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
  return matches.sort((a, b) => a.timestamp.localeCompare(b.timestamp)).at(-1) ?? null;
}

export function resolveOktaUserId(
  entries: Lab3AuditEntry[],
  userEmail: string,
  explicitOktaId?: string,
): string | null {
  if (explicitOktaId?.trim()) {
    return explicitOktaId.trim();
  }
  const approved = entries.filter(
    (entry) => entry.tool === 'revoke_access' && entry.decision === 'approved',
  );
  for (const entry of approved.reverse()) {
    const args = entry.args;
    const login =
      typeof args.userId === 'string'
        ? args.userId
        : typeof args.login === 'string'
          ? args.login
          : null;
    if (login && login.toLowerCase() === userEmail.toLowerCase()) {
      return entry.targetUser;
    }
  }
  return null;
}

export function buildScimIdToUserNameMap(
  entries: Lab1AuditEntry[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of entries) {
    if (entry.method !== 'POST' && entry.method !== 'PUT') {
      continue;
    }
    const userName = entry.request.userName;
    if (typeof userName !== 'string' || userName.length === 0) {
      continue;
    }
    if (entry.method === 'PUT') {
      const match = entry.path.match(SCIM_USER_PATH);
      if (match?.[1]) {
        map.set(match[1], userName);
      }
    }
  }
  return map;
}

export function extractScimUserId(path: string): string | null {
  const match = path.match(SCIM_USER_PATH);
  return match?.[1] ?? null;
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
    const path = String(op.path ?? '').toLowerCase();
    const isActivePath =
      path === 'active' || path.endsWith(':active') || path.includes('active');
    if (opName !== 'replace' || !isActivePath) {
      return false;
    }
    if (op.value === false) {
      return true;
    }
    if (op.value === undefined) {
      return true;
    }
    return false;
  });
}

export function findLab1Deprovision(
  entries: Lab1AuditEntry[],
  userEmail: string,
): Lab1AuditEntry | null {
  const scimMap = buildScimIdToUserNameMap(entries);
  const needle = userEmail.toLowerCase();
  const matches = entries.filter((entry) => {
    if (!isDeprovisionPatch(entry)) {
      return false;
    }
    const scimId = extractScimUserId(entry.path);
    if (!scimId) {
      return false;
    }
    const userName = scimMap.get(scimId);
    return userName?.toLowerCase() === needle;
  });
  if (matches.length === 0) {
    return null;
  }
  return matches.sort((a, b) => a.timestamp.localeCompare(b.timestamp)).at(-1) ?? null;
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
  if (!oktaUserId) {
    throw new CascadeTimelineError(
      'no Lab 3 approved revoke_access found for ' + input.userEmail,
    );
  }

  const lab3Revoke = findLab3ApprovedRevoke(lab3Entries, oktaUserId);
  if (!lab3Revoke) {
    throw new CascadeTimelineError(
      'no Lab 3 approved revoke_access found for Okta id ' + oktaUserId,
    );
  }

  const lab1Deprovision = findLab1Deprovision(lab1Entries, input.userEmail);
  if (!lab1Deprovision) {
    throw new CascadeTimelineError(
      'no downstream deprovision found for ' +
        input.userEmail +
        ' - is the SCIM app wired and the user ACTIVE?',
    );
  }

  const events = buildMergedTimeline(lab3Revoke, lab1Deprovision, input.userEmail);
  const cascadeLatencySecondsValue = cascadeLatencySeconds(
    lab3Revoke.timestamp,
    lab1Deprovision.timestamp,
  );

  return {
    userEmail: input.userEmail,
    oktaUserId,
    events,
    cascadeLatencySeconds: cascadeLatencySecondsValue,
    lab3RevokeApproved: lab3Revoke,
    lab1Deprovision,
  };
}

export function formatTimelineHuman(result: CascadeTimelineResult): string {
  const lines: string[] = [
    'Cascade timeline for ' + result.userEmail,
    'Okta user id: ' + result.oktaUserId,
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
    cascadeLatencySeconds: result.cascadeLatencySeconds,
    events: result.events,
    lab3RevokeApproved: result.lab3RevokeApproved,
    lab1Deprovision: result.lab1Deprovision,
  };
}
