import { describe, expect, test } from '@jest/globals';

import {
  applyDataNodeHeartbeatTaskDataSchema,
  applyDataNodeHeartbeatTaskDefinition,
  recordDataNodeHealthCheckTaskDataSchema,
  recordDataNodeHealthCheckTaskDefinition,
  registerDataNodeTaskDataSchema,
  registerDataNodeTaskDefinition,
  updateDataNodeStateTaskDataSchema,
  updateDataNodeStateTaskDefinition
} from '../data-node.tasks';

/* fixtures */

const lastContactAt = '2026-01-02T00:00:00.000Z';

/* tests */

describe('data node tasks', () => {
  test.each([
    ['data-node.register', registerDataNodeTaskDefinition],
    ['data-node.apply-heartbeat', applyDataNodeHeartbeatTaskDefinition],
    ['data-node.record-health-check', recordDataNodeHealthCheckTaskDefinition],
    ['data-node.update-state', updateDataNodeStateTaskDefinition]
  ] as const)('defines cluster task %s', (type, definition) => {
    expect(definition.type).toBe(type);
    expect(definition.executionScope).toBe('cluster');
  });

  test('decodes persisted registration task data', () => {
    expect(
      registerDataNodeTaskDataSchema.parse({
        id: 'data-node-1',

        certificateFingerprint: 'ab'.repeat(32),
        sessionId: '00000000-0000-4000-8000-000000000001',
        state: 'joining',

        endpoint: {
          hostname: 'data-node.internal',
          port: 50051,
          scheme: 'grpcs'
        },

        storageTotalBytes: '1000',
        storageFreeBytes: '400',

        lastContactAt,

        expectedRevision: null
      })
    ).toEqual({
      id: 'data-node-1',

      certificateFingerprint: 'ab'.repeat(32),
      sessionId: '00000000-0000-4000-8000-000000000001',
      state: 'joining',

      endpoint: {
        hostname: 'data-node.internal',
        port: 50051,
        scheme: 'grpcs'
      },

      storageTotalBytes: 1_000n,
      storageFreeBytes: 400n,

      lastContactAt: new Date(lastContactAt),

      expectedRevision: null
    });
  });

  test('decodes persisted heartbeat task data', () => {
    expect(
      applyDataNodeHeartbeatTaskDataSchema.parse({
        id: 'data-node-1',

        certificateFingerprint: 'ab'.repeat(32),
        sessionId: '00000000-0000-4000-8000-000000000001',
        heartbeatSequence: '3',
        state: 'active',

        storageTotalBytes: '1000',
        storageFreeBytes: '400',

        lastContactAt,
        lastHeartbeatAt: lastContactAt
      })
    ).toMatchObject({
      heartbeatSequence: 3n,
      storageTotalBytes: 1_000n,
      storageFreeBytes: 400n,
      lastContactAt: new Date(lastContactAt),
      lastHeartbeatAt: new Date(lastContactAt)
    });
  });

  test('rejects a non-positive heartbeat sequence', () => {
    expect(
      applyDataNodeHeartbeatTaskDataSchema.safeParse({
        id: 'data-node-1',

        certificateFingerprint: 'ab'.repeat(32),
        sessionId: '00000000-0000-4000-8000-000000000001',
        heartbeatSequence: '0',
        state: 'active',

        storageTotalBytes: '1000',
        storageFreeBytes: '400',

        lastContactAt,
        lastHeartbeatAt: lastContactAt
      }).success
    ).toBe(false);
  });

  test('decodes persisted health-check task data', () => {
    expect(
      recordDataNodeHealthCheckTaskDataSchema.parse({
        id: 'data-node-1',
        lastHealthCheckAt: lastContactAt,
        expectedRevision: '3'
      })
    ).toEqual({
      id: 'data-node-1',
      lastHealthCheckAt: new Date(lastContactAt),
      expectedRevision: 3n
    });
  });

  test('decodes persisted state-update task data', () => {
    expect(
      updateDataNodeStateTaskDataSchema.parse({
        id: 'data-node-1',
        state: 'offline',
        expectedRevision: '3'
      })
    ).toEqual({
      id: 'data-node-1',
      state: 'offline',
      expectedRevision: 3n
    });
  });
});
