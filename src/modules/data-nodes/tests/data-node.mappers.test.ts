import type { DataNode as PrismaDataNode } from '@prisma/client';
import { describe, expect, test } from '@jest/globals';

import { GenericMapperError } from '@/errors/application.errors';
import type { RecordDataNodeHeartbeatRequest, RegisterDataNodeRequest } from '@/gen/proto/membership/v1/membership';
import { HealthSnapshotStatus, type HealthSnapshot as GrpcHealthSnapshot } from '@/gen/proto/status/v1/status';

import type { DataNode } from '../data-node.domain';
import {
  mapDataNodeToDataNodeEndpoint,
  mapGrpcHealthSnapshotStatusToDomainDataNodeHealthSnapshotStatus,
  mapGrpcHealthSnapshotToDomainDataNodeHealthSnapshot,
  mapGrpcRecordDataNodeHeartbeatRequestToHeartbeatDataNodeInput,
  mapGrpcRegisterDataNodeRequestToRegisterDataNodeInput,
  mapPrismaDataNodeToDomainDataNode
} from '../data-node.mappers';

/* fixtures */

const certificateFingerprint = 'ab'.repeat(32);

const grpcHealthSnapshot: GrpcHealthSnapshot = {
  status: HealthSnapshotStatus.HEALTH_SNAPSHOT_STATUS_HEALTHY,
  database_ok: true,
  storage_ok: true,
  storage_total_bytes: '1000',
  storage_free_bytes: '400',
  message: 'healthy'
};

const prismaDataNode: PrismaDataNode = {
  id: 'data-node-1',
  cluster_record_id: 'self',

  certificate_fingerprint: certificateFingerprint,
  session_id: '00000000-0000-4000-8000-000000000001',
  last_heartbeat_sequence: 2n,
  state: 'active',
  mode: 'serving',

  hostname: 'data-node.internal',
  port: 50051,
  scheme: 'grpcs',

  storage_total_bytes: 1_000n,
  storage_free_bytes: 400n,

  registered_at: new Date('2026-01-01T00:00:00.000Z'),
  last_contact_at: new Date('2026-01-02T00:00:00.000Z'),
  last_health_check_at: null,
  last_heartbeat_at: new Date('2026-01-02T00:00:00.000Z'),
  removed_at: null,
  updated_at: new Date('2026-01-02T00:00:00.000Z'),

  revision: 3n
};

const domainDataNode: DataNode = {
  id: prismaDataNode.id,

  certificateFingerprint: prismaDataNode.certificate_fingerprint,
  sessionId: prismaDataNode.session_id,
  lastHeartbeatSequence: prismaDataNode.last_heartbeat_sequence,
  state: prismaDataNode.state,
  mode: prismaDataNode.mode,

  hostname: prismaDataNode.hostname,
  port: prismaDataNode.port,
  scheme: 'grpcs',

  storageTotalBytes: prismaDataNode.storage_total_bytes,
  storageFreeBytes: prismaDataNode.storage_free_bytes,

  registeredAt: prismaDataNode.registered_at,
  lastContactAt: prismaDataNode.last_contact_at,
  lastHealthCheckAt: prismaDataNode.last_health_check_at,
  lastHeartbeatAt: prismaDataNode.last_heartbeat_at,
  updatedAt: prismaDataNode.updated_at,

  revision: prismaDataNode.revision
};

/* tests */

describe('data node mappers', () => {
  test.each([
    [HealthSnapshotStatus.HEALTH_SNAPSHOT_STATUS_HEALTHY, 'healthy'],
    [HealthSnapshotStatus.HEALTH_SNAPSHOT_STATUS_DEGRADED, 'degraded']
  ] as const)('maps gRPC health status %i to %s', (status, expected) => {
    expect(mapGrpcHealthSnapshotStatusToDomainDataNodeHealthSnapshotStatus(status)).toBe(expected);
  });

  test('rejects an unrecognized gRPC health status', () => {
    expect(() =>
      mapGrpcHealthSnapshotStatusToDomainDataNodeHealthSnapshotStatus(HealthSnapshotStatus.UNRECOGNIZED)
    ).toThrow(GenericMapperError);
  });

  test('maps a gRPC health snapshot and parses its byte counts', () => {
    expect(mapGrpcHealthSnapshotToDomainDataNodeHealthSnapshot(grpcHealthSnapshot)).toEqual({
      status: 'healthy',
      databaseOk: true,
      storageOk: true,
      storageTotalBytes: 1_000n,
      storageFreeBytes: 400n,
      message: 'healthy'
    });
  });

  test('rejects inconsistent gRPC storage metadata', () => {
    expect(() =>
      mapGrpcHealthSnapshotToDomainDataNodeHealthSnapshot({
        ...grpcHealthSnapshot,
        storage_free_bytes: '1001'
      })
    ).toThrow(GenericMapperError);
  });

  test('maps a gRPC registration request with its authenticated certificate', () => {
    const request: RegisterDataNodeRequest = {
      node_id: 'data-node-1',
      hostname: 'data-node.internal',
      port: 50051,
      scheme: 'grpcs',
      health_snapshot: grpcHealthSnapshot
    };

    expect(mapGrpcRegisterDataNodeRequestToRegisterDataNodeInput(request, certificateFingerprint)).toEqual({
      id: 'data-node-1',
      certificateFingerprint,
      endpoint: {
        hostname: 'data-node.internal',
        port: 50051,
        scheme: 'grpcs'
      },
      healthSnapshot: {
        status: 'healthy',
        databaseOk: true,
        storageOk: true,
        storageTotalBytes: 1_000n,
        storageFreeBytes: 400n,
        message: 'healthy'
      }
    });
  });

  test('maps a gRPC heartbeat request and parses its sequence', () => {
    const request: RecordDataNodeHeartbeatRequest = {
      node_id: 'data-node-1',
      session_id: prismaDataNode.session_id,
      heartbeat_sequence: '3',
      health_snapshot: grpcHealthSnapshot
    };

    expect(mapGrpcRecordDataNodeHeartbeatRequestToHeartbeatDataNodeInput(request, certificateFingerprint)).toEqual({
      id: 'data-node-1',
      certificateFingerprint,
      sessionId: prismaDataNode.session_id,
      heartbeatSequence: 3n,
      healthSnapshot: {
        status: 'healthy',
        databaseOk: true,
        storageOk: true,
        storageTotalBytes: 1_000n,
        storageFreeBytes: 400n,
        message: 'healthy'
      }
    });
  });

  test.each([
    {
      kind: 'registration',
      map: () =>
        mapGrpcRegisterDataNodeRequestToRegisterDataNodeInput(
          {
            node_id: 'data-node-1',
            hostname: 'data-node.internal',
            port: 50051,
            scheme: 'grpcs',
            health_snapshot: undefined
          },
          certificateFingerprint
        )
    },
    {
      kind: 'heartbeat',
      map: () =>
        mapGrpcRecordDataNodeHeartbeatRequestToHeartbeatDataNodeInput(
          {
            node_id: 'data-node-1',
            session_id: prismaDataNode.session_id,
            heartbeat_sequence: '3',
            health_snapshot: undefined
          },
          certificateFingerprint
        )
    }
  ])('rejects a $kind request without a health snapshot', ({ map }) => {
    expect(map).toThrow(GenericMapperError);
  });

  test('maps a domain data node to its endpoint', () => {
    expect(mapDataNodeToDataNodeEndpoint(domainDataNode)).toEqual({
      hostname: 'data-node.internal',
      port: 50051,
      scheme: 'grpcs'
    });
  });

  test('maps a Prisma data node to the domain entity', () => {
    expect(mapPrismaDataNodeToDomainDataNode(prismaDataNode)).toEqual(domainDataNode);
  });

  test('wraps invalid Prisma data in a mapper error', () => {
    expect(() =>
      mapPrismaDataNodeToDomainDataNode({
        ...prismaDataNode,
        port: 0
      })
    ).toThrow(GenericMapperError);
  });
});
