import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  correlateCascade,
  CascadeTimelineError,
  cascadeLatencySeconds,
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
  });
});
