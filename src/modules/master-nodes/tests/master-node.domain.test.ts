import { describe, expect, test } from '@jest/globals';

import { masterNodeEndpointSchema, masterNodeHealthSnapshotSchema, masterNodeSchema } from '../master-node.domain';

/* fixtures */

const masterNode = {
  id: 'master-node-012345abcdef',

  certificateFingerprint: 'ab'.repeat(32),
  sessionId: '00000000-0000-4000-8000-000000000001',
  state: 'active',
  mode: 'serving',

  hostname: 'master-node.internal',
  port: 50051,
  scheme: 'grpcs',

  registeredAt: new Date('2026-01-01T00:00:00.000Z'),
  lastContactAt: new Date('2026-01-02T00:00:00.000Z'),
  lastHealthCheckAt: null,
  lastHeartbeatAt: null,
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),

  revision: 2n
} as const;

/* tests */

describe('master node domain schemas', () => {
  test('accepts a valid master node', () => {
    expect(masterNodeSchema.parse(masterNode)).toEqual(masterNode);
  });

  test.each([
    { field: 'id', value: '' },
    { field: 'certificateFingerprint', value: '' },
    { field: 'sessionId', value: 'not-a-uuid' },
    { field: 'state', value: 'unknown' },
    { field: 'mode', value: 'unknown' },
    { field: 'hostname', value: '' },
    { field: 'port', value: 0 },
    { field: 'port', value: 65536 },
    { field: 'scheme', value: 'grpc' },
    { field: 'revision', value: -1n }
  ])('rejects a master node with invalid $field', ({ field, value }) => {
    expect(
      masterNodeSchema.safeParse({
        ...masterNode,
        [field]: value
      }).success
    ).toBe(false);
  });

  test('accepts a secure master node endpoint', () => {
    expect(
      masterNodeEndpointSchema.parse({
        hostname: 'master-node.internal',
        port: 50051,
        scheme: 'grpcs'
      })
    ).toEqual({
      hostname: 'master-node.internal',
      port: 50051,
      scheme: 'grpcs'
    });
  });

  test.each([1, 65535])('accepts endpoint port boundary %i', (port) => {
    expect(
      masterNodeEndpointSchema.safeParse({
        hostname: 'master-node.internal',
        port,
        scheme: 'grpcs'
      }).success
    ).toBe(true);
  });

  test.each(['healthy', 'degraded'])('accepts %s master node health snapshots', (status) => {
    expect(
      masterNodeHealthSnapshotSchema.safeParse({
        status,
        databaseOk: status === 'healthy',
        message: 'Health check completed'
      }).success
    ).toBe(true);
  });

  test('rejects an unknown health snapshot status', () => {
    expect(
      masterNodeHealthSnapshotSchema.safeParse({
        status: 'unknown',
        databaseOk: false,
        message: 'Unknown state'
      }).success
    ).toBe(false);
  });
});
