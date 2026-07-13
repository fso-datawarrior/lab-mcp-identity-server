import { describe, expect, it, vi } from 'vitest';
import {
  hasOktaAppsReadScope,
  runPreflight,
  type ReadOnlyOktaProbe,
} from '../src/cascade/preflight.js';

function createMockProbe(overrides: Partial<ReadOnlyOktaProbe> = {}): ReadOnlyOktaProbe {
  return {
    async getGroup() {
      return { id: '00gDemoGroup', name: 'lab3-demo-group' };
    },
    async listGroupUsers() {
      return [
        {
          id: '00uAlice',
          login: 'lab3-demo-alice@example.com',
          status: 'STAGED',
        },
      ];
    },
    async listAssignedApplicationsForGroup() {
      return [];
    },
    ...overrides,
  };
}

describe('cascade preflight app-wiring (AD-14)', () => {
  it('hasOktaAppsReadScope returns false when okta.apps.read is absent', () => {
    expect(
      hasOktaAppsReadScope([
        'okta.users.read',
        'okta.groups.read',
        'okta.users.manage',
        'okta.groups.manage',
      ]),
    ).toBe(false);
  });

  it('marks app-wiring UNVERIFIED and skips app API when okta.apps.read is absent', async () => {
    const listApps = vi.fn(async () => [{ id: '0oaApp', label: 'SCIM App' }]);
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});

    const summary = await runPreflight(
      createMockProbe({ listAssignedApplicationsForGroup: listApps }),
      '00gDemoGroup',
      ['okta.users.read', 'okta.groups.read'],
    );

    expect(summary.appWiringStatus).toBe('unverified');
    expect(summary.apps).toBeNull();
    expect(listApps).not.toHaveBeenCalled();

    const stderrLines = stderr.mock.calls.map((call) => String(call[0]));
    expect(stderrLines.some((line) => line.includes('manual SCIM wiring checklist'))).toBe(true);
    expect(stderrLines.some((line) => line.includes('apps assigned to group (0)'))).toBe(false);

    stderr.mockRestore();
  });

  it('uses verified app count path when okta.apps.read is present', async () => {
    const listApps = vi.fn(async () => [
      { id: '0oa151n0671V7qDK9698', label: 'AI Platform (Demonstration)' },
    ]);
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});

    const summary = await runPreflight(
      createMockProbe({ listAssignedApplicationsForGroup: listApps }),
      '00gDemoGroup',
      ['okta.users.read', 'okta.groups.read', 'okta.apps.read'],
    );

    expect(summary.appWiringStatus).toBe('verified');
    expect(summary.apps).toHaveLength(1);
    expect(listApps).toHaveBeenCalledOnce();

    stderr.mockRestore();
  });

  it('reports verified zero when okta.apps.read is present and API returns empty list', async () => {
    const listApps = vi.fn(async () => []);

    const summary = await runPreflight(
      createMockProbe({ listAssignedApplicationsForGroup: listApps }),
      '00gDemoGroup',
      ['okta.groups.read', 'okta.apps.read'],
    );

    expect(summary.appWiringStatus).toBe('verified');
    expect(summary.apps).toEqual([]);
    expect(listApps).toHaveBeenCalledOnce();
  });
});
