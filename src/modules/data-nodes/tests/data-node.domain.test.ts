import { describe, expect, test } from '@jest/globals';

import { dataNodeEndpointSchema, dataNodeHealthSnapshotSchema, dataNodeSchema } from '../data-node.domain';

/* fixtures */

const dataNode = {
  id: 'data-node-1',

  certificateFingerprint: 'ab'.repeat(32),
  sessionId: '00000000-0000-4000-8000-000000000001',
  lastHeartbeatSequence: 2n,
  state: 'active',
  mode: 'serving',

  hostname: 'data-node.internal',
  port: 50051,
  scheme: 'grpcs',

  storageTotalBytes: 1_000n,
  storageFreeBytes: 400n,

  registeredAt: new Date('2026-01-01T00:00:00.000Z'),
  lastContactAt: new Date('2026-01-02T00:00:00.000Z'),
  lastHealthCheckAt: null,
  lastHeartbeatAt: new Date('2026-01-02T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),

  revision: 3n
} as const;

const healthSnapshot = {
  status: 'healthy',
  databaseOk: true,
  storageOk: true,
  storageTotalBytes: 1_000n,
  storageFreeBytes: 400n,
  message: 'healthy'
} as const;

/* tests */

describe('data node domain schemas', () => {
  test('accepts a valid data node', () => {
    expect(dataNodeSchema.parse(dataNode)).toEqual(dataNode);
  });

  test.each([
    { field: 'id', value: '' },
    { field: 'certificateFingerprint', value: '' },
    { field: 'sessionId', value: 'not-a-uuid' },
    { field: 'lastHeartbeatSequence', value: -1n },
    { field: 'state', value: 'unknown' },
    { field: 'mode', value: 'unknown' },
    { field: 'hostname', value: '' },
    { field: 'port', value: 0 },
    { field: 'port', value: 65536 },
    { field: 'scheme', value: 'grpc' },
    { field: 'storageTotalBytes', value: -1n },
    { field: 'storageFreeBytes', value: -1n },
    { field: 'revision', value: -1n }
  ])('rejects a data node with invalid $field', ({ field, value }) => {
    expect(
      dataNodeSchema.safeParse({
        ...dataNode,
        [field]: value
      }).success
    ).toBe(false);
  });

  test('accepts a secure data node endpoint', () => {
    expect(
      dataNodeEndpointSchema.parse({
        hostname: 'data-node.internal',
        port: 50051,
        scheme: 'grpcs'
      })
    ).toEqual({
      hostname: 'data-node.internal',
      port: 50051,
      scheme: 'grpcs'
    });
  });

  test('accepts a health snapshot whose free storage does not exceed total storage', () => {
    expect(dataNodeHealthSnapshotSchema.parse(healthSnapshot)).toEqual(healthSnapshot);
  });

  test('rejects a health snapshot whose free storage exceeds total storage', () => {
    expect(
      dataNodeHealthSnapshotSchema.safeParse({
        ...healthSnapshot,
        storageFreeBytes: 1_001n
      }).success
    ).toBe(false);
  });

  test.each([
    { field: 'status', value: 'unknown' },
    { field: 'storageTotalBytes', value: -1n },
    { field: 'storageFreeBytes', value: -1n }
  ])('rejects a health snapshot with invalid $field', ({ field, value }) => {
    expect(
      dataNodeHealthSnapshotSchema.safeParse({
        ...healthSnapshot,
        [field]: value
      }).success
    ).toBe(false);
  });
});
