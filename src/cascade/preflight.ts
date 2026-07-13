import okta from '@okta/okta-sdk-nodejs';
import {
  loadOktaConfig,
  summarizeOktaConfig,
  type OktaConfig,
} from '../config/oktaConfig.js';
import { ForbiddenError, mapOktaSdkError } from '../okta/errors.js';

/** Read-only Okta probe surface. No write or lifecycle methods exist on this type. */
export type ReadOnlyOktaProbe = {
  getGroup(groupId: string): Promise<{ id: string; name: string }>;
  listGroupUsers(
    groupId: string,
  ): Promise<Array<{ id: string; login: string; status: string }>>;
  listAssignedApplicationsForGroup(
    groupId: string,
  ): Promise<Array<{ id: string; label: string }>>;
};

const READ_ONLY_METHODS = new Set([
  'getGroup',
  'listGroupUsers',
  'listAssignedApplicationsForGroup',
]);

function assertReadOnlySurface(probe: ReadOnlyOktaProbe): void {
  for (const key of Object.keys(probe)) {
    if (!READ_ONLY_METHODS.has(key)) {
      throw new Error('preflight probe must not expose method: ' + key);
    }
  }
}

async function collectCollection<T>(
  collection: AsyncIterable<T | null>,
): Promise<T[]> {
  const items: T[] = [];
  for await (const item of collection) {
    if (item) {
      items.push(item);
    }
  }
  return items;
}

export function createReadOnlyOktaProbe(config: OktaConfig): ReadOnlyOktaProbe {
  const sdk = new okta.Client({
    orgUrl: config.orgUrl,
    authorizationMode: 'PrivateKey',
    clientId: config.oauthClientId,
    scopes: config.scopes,
    privateKey: config.privateKeyPem,
    ...(config.oauthKeyId ? { keyId: config.oauthKeyId } : {}),
  });

  const probe: ReadOnlyOktaProbe = {
    async getGroup(groupId) {
      const group = await sdk.groupApi.getGroup({ groupId });
      return {
        id: group.id ?? groupId,
        name: group.profile?.name ?? '(unknown)',
      };
    },

    async listGroupUsers(groupId) {
      const users = await collectCollection(
        await sdk.groupApi.listGroupUsers({ groupId }),
      );
      return users.map((user) => ({
        id: user.id ?? '',
        login: user.profile?.login ?? '',
        status: user.status ?? 'UNKNOWN',
      }));
    },

    async listAssignedApplicationsForGroup(groupId) {
      const apps = await collectCollection(
        await sdk.groupApi.listAssignedApplicationsForGroup({ groupId }),
      );
      return apps.map((app) => ({
        id: app.id ?? '',
        label: app.label ?? '',
      }));
    },
  };

  assertReadOnlySurface(probe);
  return probe;
}

export function printManualScimChecklist(groupName: string): void {
  console.error('');
  console.error('=== manual SCIM wiring checklist (okta.apps.read not granted) ===');
  console.error('1. Assign ' + groupName + ' to the SCIM app in Okta Admin.');
  console.error('2. Enable Create + Deactivate provisioning actions on the SCIM app.');
  console.error('3. Confirm the SCIM base URL points at the current Lab 1 tunnel.');
  console.error('4. Confirm the cascade target user is ACTIVE and provisioned downstream.');
  console.error('5. STAGED users may not provision downstream; use an ACTIVE cascade user.');
  console.error('===================================================================');
  console.error('');
}

export type PreflightSummary = {
  groupId: string;
  groupName: string;
  members: Array<{ id: string; login: string; status: string }>;
  apps: Array<{ id: string; label: string }> | null;
  appsReadDegraded: boolean;
};

export async function runPreflight(
  probe: ReadOnlyOktaProbe,
  groupId: string,
): Promise<PreflightSummary> {
  const group = await probe.getGroup(groupId);
  const members = await probe.listGroupUsers(groupId);

  let apps: Array<{ id: string; label: string }> | null = null;
  let appsReadDegraded = false;
  try {
    apps = await probe.listAssignedApplicationsForGroup(groupId);
  } catch (err: unknown) {
    const mapped = mapOktaSdkError(err);
    if (mapped instanceof ForbiddenError || (mapped.message && mapped.message.includes('403'))) {
      appsReadDegraded = true;
      printManualScimChecklist(group.name);
    } else {
      throw mapped;
    }
  }

  return {
    groupId,
    groupName: group.name,
    members,
    apps,
    appsReadDegraded,
  };
}

export async function runPreflightCli(): Promise<void> {
  if ((process.env.OKTA_CLIENT_MODE ?? 'mock').trim().toLowerCase() !== 'real') {
    throw new Error('OKTA_CLIENT_MODE must be real for cascade:preflight');
  }

  const config = await loadOktaConfig();
  console.error(
    '[cascade:preflight] config: ' + JSON.stringify(summarizeOktaConfig(config)),
  );

  const probe = createReadOnlyOktaProbe(config);
  const summary = await runPreflight(probe, config.oktaDemoGroupId);

  console.error('[cascade:preflight] demo group: ' + summary.groupName + ' (' + summary.groupId + ')');
  console.error('[cascade:preflight] members (' + summary.members.length + '):');
  for (const member of summary.members) {
    console.error(
      '  - ' + member.login + ' id=' + member.id + ' status=' + member.status,
    );
  }

  if (summary.appsReadDegraded) {
    console.error('[cascade:preflight] app assignments: skipped (okta.apps.read not granted)');
  } else if (summary.apps) {
    console.error('[cascade:preflight] apps assigned to group (' + summary.apps.length + '):');
    for (const app of summary.apps) {
      console.error('  - ' + app.label + ' id=' + app.id);
    }
  }

  const stagedMembers = summary.members.filter((m) => m.status === 'STAGED');
  if (stagedMembers.length > 0) {
    console.error(
      '[cascade:preflight] note: STAGED members may not provision downstream (' +
        stagedMembers.map((m) => m.login).join(', ') +
        '). Prefer an ACTIVE cascade user.',
    );
  }

  console.error('[cascade:preflight] readiness: read-only probe complete (no writes performed)');
}
