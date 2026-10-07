import { Buffer } from 'node:buffer';

import { describe, expect, test } from '@jest/globals';

import { replicateTaskInputSchema } from '../task.application';

/* fixtures */

const now = new Date('2026-01-01T00:00:00.000Z');

const replicateTaskInput = {
  id: '00000000-0000-4000-8000-000000000001',

  originMasterNodeId: 'master-node-aaaaaaaaaaaa',
  epoch: 1n,
  sequence: 2n,

  type: 'test.replicate',
  executionScope: 'cluster' as const,
  data: { value: 'test' },

  payloadId: '00000000-0000-4000-8000-000000000002',
  payload: Buffer.from('payload'),

  createdAt: now
};

/* tests */

describe('task application schemas', () => {
  test('parses replicated task data with an optional payload', () => {
    expect(replicateTaskInputSchema.parse(replicateTaskInput)).toEqual(replicateTaskInput);
    expect(
      replicateTaskInputSchema.parse({
        ...replicateTaskInput,
        payloadId: null,
        payload: undefined
      })
    ).toEqual({
      ...replicateTaskInput,
      payloadId: null,
      payload: undefined
    });
  });

  test('rejects invalid replicated task identity and payload values', () => {
    expect(replicateTaskInputSchema.safeParse({ ...replicateTaskInput, id: 'invalid' }).success).toBe(false);
    expect(replicateTaskInputSchema.safeParse({ ...replicateTaskInput, payload: 'not-bytes' }).success).toBe(false);
  });
});
