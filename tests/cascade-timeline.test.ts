import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  correlateCascade,
  CascadeTimelineError,
  cascadeLatencySeconds,
  findLab1Deprovision,
  isDeprovisionPatch,
  isLossyDeprovisionPatch,
  printMatchMethodNotes,
  AD17_CAVEAT,
} from '../src/cascade/timeline.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

describe('cascade timeline correlator', () => {
  it('correlates Lab 3 revoke approval with Lab 1 SCIM deprovision by userName', async () => {
    const result = await correlateCascade({
      lab3Path: join(FIXTURES, 'lab3-cascade-audit.jsonl'),
      lab1Path: join(FIXTURES, 'lab1-cascade-audit.jsonl'),
      userEmail: 'cascade-active@example.com',
      oktaUserId: '00uCascadeUser',
    });

    expect(result.oktaUserId).toBe('00uCascadeUser');
    expect(result.matchMethod).toBe('username');
    expect(result.lab3RevokeApproved.decision).toBe('approved');
    expect(result.lab1Deprovision.method).toBe('PATCH');
    expect(result.events).toHaveLength(2);
    expect(result.cascadeLatencySeconds).toBe(cascadeLatencySeconds(
      '2026-07-13T18:00:05.000Z',
      '2026-07-13T18:00:30.000Z',
    ));
  });

  it('fails closed when Lab 1 deprovision line is absent', async () => {
    await expect(
      correlateCascade({
        lab3Path: join(FIXTURES, 'lab3-cascade-audit.jsonl'),
        lab1Path: join(FIXTURES, 'lab1-no-deprovision-audit.jsonl'),
        userEmail: 'cascade-active@example.com',
        oktaUserId: '00uCascadeUser',
      }),
    ).rejects.toThrow(CascadeTimelineError);

    await expect(
      correlateCascade({
        lab3Path: join(FIXTURES, 'lab3-cascade-audit.jsonl'),
        lab1Path: join(FIXTURES, 'lab1-no-deprovision-audit.jsonl'),
        userEmail: 'cascade-active@example.com',
        oktaUserId: '00uCascadeUser',
      }),
    ).rejects.toThrow(/no downstream deprovision found/);
  });

  it('resolves matching modes regression via explicit okta id', async () => {
    const result = await correlateCascade({
      lab3Path: join(FIXTURES, 'lab3-cascade-audit.jsonl'),
      lab1Path: join(FIXTURES, 'lab1-cascade-audit.jsonl'),
      userEmail: 'cascade-active@example.com',
      oktaUserId: '00uCascadeUser',
    });

    expect(result.events[0].source).toBe('lab3');
    expect(result.events[1].source).toBe('lab1');
    expect(result.cascadeLatencySeconds).toBe(25);
    expect(result.matchMethod).toBe('username');
  });

  it('correlates pure joiner-leaver run via sole-candidate fallback', async () => {
    const result = await correlateCascade({
      lab3Path: join(FIXTURES, 'lab3-cascade-audit.jsonl'),
      lab1Path: join(FIXTURES, 'lab1-joiner-leaver-audit.jsonl'),
      userEmail: 'cascade-active@example.com',
      oktaUserId: '00uCascadeUser',
    });

    expect(result.matchMethod).toBe('sole-candidate');
    expect(result.lab1Deprovision.path).toBe('/scim/v2/Users/scim-joiner-001');
    expect(result.cascadeLatencySeconds).toBe(25);
  });

  it('detects object-form deprovision PATCH', async () => {
    const entry = {
      timestamp: '2026-07-13T18:00:30.000Z',
      method: 'PATCH',
      path: '/scim/v2/Users/scim-object-001',
      actor: 'test',
      request: { operations: [{ op: 'replace', value: { active: false } }] },
      status: 200,
    };
    expect(isDeprovisionPatch(entry)).toBe(true);

    const result = await correlateCascade({
      lab3Path: join(FIXTURES, 'lab3-cascade-audit.jsonl'),
      lab1Path: join(FIXTURES, 'lab1-object-form-deprovision-audit.jsonl'),
      userEmail: 'cascade-active@example.com',
      oktaUserId: '00uCascadeUser',
    });

    expect(result.matchMethod).toBe('username');
    expect(result.lab1Deprovision.path).toBe('/scim/v2/Users/scim-object-001');
  });

  it('rejects undefined value as deprovision', () => {
    const entry = {
      timestamp: '2026-07-13T18:00:30.000Z',
      method: 'PATCH',
      path: '/scim/v2/Users/scim-test',
      actor: 'test',
      request: { operations: [{ op: 'replace', path: 'active' }] },
      status: 200,
    };
    expect(isDeprovisionPatch(entry)).toBe(false);
  });

  it('matches explicit --scim-id override', async () => {
    const result = await correlateCascade({
      lab3Path: join(FIXTURES, 'lab3-cascade-audit.jsonl'),
      lab1Path: join(FIXTURES, 'lab1-scim-id-override-audit.jsonl'),
      userEmail: 'cascade-active@example.com',
      oktaUserId: '00uCascadeUser',
      scimUserId: 'scim-cascade-002',
    });

    expect(result.matchMethod).toBe('scim-id');
    expect(result.lab1Deprovision.path).toBe('/scim/v2/Users/scim-cascade-002');
  });

  it('fails closed on ambiguous deprovision when multiple PATCHes and no match', async () => {
    await expect(
      correlateCascade({
        lab3Path: join(FIXTURES, 'lab3-cascade-audit.jsonl'),
        lab1Path: join(FIXTURES, 'lab1-ambiguous-deprovision-audit.jsonl'),
        userEmail: 'cascade-active@example.com',
        oktaUserId: '00uCascadeUser',
      }),
    ).rejects.toThrow(/ambiguous Lab 1 deprovision/);

    expect(() =>
      findLab1Deprovision(
        [
          {
            timestamp: '2026-07-13T18:00:20.000Z',
            method: 'PATCH',
            path: '/scim/v2/Users/a',
            actor: 'x',
            request: { operations: [{ op: 'replace', path: 'active', value: false }] },
            status: 200,
          },
          {
            timestamp: '2026-07-13T18:00:25.000Z',
            method: 'PATCH',
            path: '/scim/v2/Users/b',
            actor: 'x',
            request: { operations: [{ op: 'replace', path: 'active', value: false }] },
            status: 200,
          },
        ],
        'nobody@example.com',
      ),
    ).toThrow(/ambiguous Lab 1 deprovision/);
  });

  it('uses sole Lab 3 approved revoke when email does not match args', async () => {
    const result = await correlateCascade({
      lab3Path: join(FIXTURES, 'lab3-cascade-audit.jsonl'),
      lab1Path: join(FIXTURES, 'lab1-joiner-leaver-audit.jsonl'),
      userEmail: 'cascade-active@example.com',
    });

    expect(result.oktaUserId).toBe('00uCascadeUser');
    expect(result.matchMethod).toBe('sole-candidate');
  });

  it('matches lossy Lab 1 replace PATCH when --scim-id is asserted (AD-17)', async () => {
    const lossyEntry = {
      timestamp: '2026-07-13T18:00:05.800Z',
      method: 'PATCH',
      path: '/scim/v2/Users/2ff05e8a-d2d7-48a4-bef7-a83c3f4380b2',
      actor: 'cda486dca4a9',
      request: {
        operations: [{ op: 'replace' }],
        path: '/2ff05e8a-d2d7-48a4-bef7-a83c3f4380b2',
      },
      status: 200,
    };
    expect(isLossyDeprovisionPatch(lossyEntry)).toBe(true);
    expect(isDeprovisionPatch(lossyEntry)).toBe(false);

    const result = await correlateCascade({
      lab3Path: join(FIXTURES, 'lab3-lossy-cascade-audit.jsonl'),
      lab1Path: join(FIXTURES, 'lab1-lossy-deprovision-audit.jsonl'),
      userEmail: 'lab3-demo-carol@example.com',
      oktaUserId: '00uCarolCascade',
      scimUserId: '2ff05e8a-d2d7-48a4-bef7-a83c3f4380b2',
    });

    expect(result.matchMethod).toBe('scim-id-replace-unconfirmed');
    expect(result.lab1Deprovision.path).toBe(
      '/scim/v2/Users/2ff05e8a-d2d7-48a4-bef7-a83c3f4380b2',
    );
    expect(result.cascadeLatencySeconds).toBe(cascadeLatencySeconds(
      '2026-07-13T18:00:02.900Z',
      '2026-07-13T18:00:05.800Z',
    ));

    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
    printMatchMethodNotes('scim-id-replace-unconfirmed');
    expect(stderr).toHaveBeenCalledWith(AD17_CAVEAT);
    stderr.mockRestore();
  });

  it('does not match lossy replace PATCH on a different scim-id', async () => {
    await expect(
      correlateCascade({
        lab3Path: join(FIXTURES, 'lab3-lossy-cascade-audit.jsonl'),
        lab1Path: join(FIXTURES, 'lab1-lossy-wrong-scim-audit.jsonl'),
        userEmail: 'lab3-demo-carol@example.com',
        oktaUserId: '00uCarolCascade',
        scimUserId: '2ff05e8a-d2d7-48a4-bef7-a83c3f4380b2',
      }),
    ).rejects.toThrow(/no downstream deprovision found/);
  });

  it('fails closed on lossy replace PATCH without --scim-id', async () => {
    await expect(
      correlateCascade({
        lab3Path: join(FIXTURES, 'lab3-lossy-cascade-audit.jsonl'),
        lab1Path: join(FIXTURES, 'lab1-lossy-deprovision-audit.jsonl'),
        userEmail: 'lab3-demo-carol@example.com',
        oktaUserId: '00uCarolCascade',
      }),
    ).rejects.toThrow(/no downstream deprovision found/);

    expect(
      findLab1Deprovision(
        [
          {
            timestamp: '2026-07-13T18:00:05.800Z',
            method: 'PATCH',
            path: '/scim/v2/Users/2ff05e8a-d2d7-48a4-bef7-a83c3f4380b2',
            actor: 'x',
            request: { operations: [{ op: 'replace' }] },
            status: 200,
          },
        ],
        'lab3-demo-carol@example.com',
      ),
    ).toBeNull();
  });

  it('still matches rich active:false PATCH as scim-id', async () => {
    const result = await correlateCascade({
      lab3Path: join(FIXTURES, 'lab3-cascade-audit.jsonl'),
      lab1Path: join(FIXTURES, 'lab1-scim-id-override-audit.jsonl'),
      userEmail: 'cascade-active@example.com',
      oktaUserId: '00uCascadeUser',
      scimUserId: 'scim-cascade-002',
    });

    expect(result.matchMethod).toBe('scim-id');
    expect(isDeprovisionPatch(result.lab1Deprovision)).toBe(true);
  });
});
