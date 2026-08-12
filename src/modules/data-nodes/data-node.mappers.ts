import type { DataNode as PrismaDataNode } from '@prisma/client';

import { wrapMapping } from '@/mappers/mapping';
import { GenericMappingError } from '@/errors/application.errors';
import { healthSnapshotStatusToJSON, type HealthSnapshot as GrpcHealthSnapshot } from '@/gen/proto/health/v1/health';
import type { RegisterDataNodeRequest } from '@/gen/proto/register/v1/register';
import type { HeartbeatDataNodeRequest } from '@/gen/proto/heartbeat/v1/heartbeat';

import {
  heartbeatDataNodeInputSchema,
  type HeartbeatDataNodeInput,
  registerDataNodeInputSchema,
  type RegisterDataNodeInput
} from './data-node.application';
import {
  dataNodeHealthSnapshotSchema,
  dataNodeSchema,
  type DataNode,
  type DataNodeHealthSnapshot,
  type DataNodeHealthSnapshotStatus
} from './data-node.domain';

export const mapPrismaDataNodeToDomainDataNode = (dataNode: PrismaDataNode): DataNode => {
  return wrapMapping('Failed to map Prisma data node to domain data node', () =>
    dataNodeSchema.parse({
      nodeId: dataNode.node_id,
      hostname: dataNode.hostname,
      port: dataNode.port,
      scheme: dataNode.scheme,
      state: dataNode.state,
      storageTotalBytes: dataNode.storage_total_bytes,
      storageFreeBytes: dataNode.storage_free_bytes,
      lastHeartbeatAt: dataNode.last_heartbeat_at,
      registeredAt: dataNode.registered_at,
      updatedAt: dataNode.updated_at
    })
  );
};

export const mapGrpcHealthSnapshotStatusToDomainDataNodeHealthSnapshotStatus = (
  status: GrpcHealthSnapshot['status']
): DataNodeHealthSnapshotStatus => {
  return wrapMapping('Failed to map gRPC health snapshot status to domain health snapshot status', () => {
    const grpcHealthSnapshotStatus = healthSnapshotStatusToJSON(status);

    switch (grpcHealthSnapshotStatus) {
      case 'HEALTH_SNAPSHOT_STATUS_HEALTHY':
        return 'healthy';

      case 'HEALTH_SNAPSHOT_STATUS_DEGRADED':
        return 'degraded';

      default:
        throw new GenericMappingError('Invalid health snapshot status');
    }
  });
};

const parseByteCount = (value: string): bigint => {
  if (!/^\d+$/.test(value)) {
    throw new GenericMappingError('Invalid bytes value');
  }

  return BigInt(value);
};

export const mapGrpcHealthSnapshotToDomainDataNodeHealthSnapshot = (
  healthSnapshot: GrpcHealthSnapshot
): DataNodeHealthSnapshot => {
  return wrapMapping('Failed to map gRPC health snapshot to domain data node health snapshot', () =>
    dataNodeHealthSnapshotSchema.parse({
      status: mapGrpcHealthSnapshotStatusToDomainDataNodeHealthSnapshotStatus(healthSnapshot.status),
      databaseOk: healthSnapshot.database_ok,
      storageOk: healthSnapshot.storage_ok,
      storageTotalBytes: parseByteCount(healthSnapshot.storage_total_bytes),
      storageFreeBytes: parseByteCount(healthSnapshot.storage_free_bytes),
      message: healthSnapshot.message
    })
  );
};

export const mapGrpcHeartbeatDataNodeRequestToHeartbeatDataNodeInput = (
  request: HeartbeatDataNodeRequest
): HeartbeatDataNodeInput => {
  return wrapMapping('Failed to map gRPC heartbeat data node request to heartbeat data node input', () => {
    if (!request.health_snapshot) {
      throw new GenericMappingError('Health snapshot is required');
    }

    return heartbeatDataNodeInputSchema.parse({
      nodeId: request.node_id,
      healthSnapshot: mapGrpcHealthSnapshotToDomainDataNodeHealthSnapshot(request.health_snapshot)
    });
  });
};

export const mapGrpcRegisterDataNodeRequestToRegisterDataNodeInput = (
  request: RegisterDataNodeRequest
): RegisterDataNodeInput => {
  return wrapMapping('Failed to map gRPC register data node request to register data node input', () => {
    if (!request.health_snapshot) {
      throw new GenericMappingError('Health snapshot is required');
    }

    return registerDataNodeInputSchema.parse({
      nodeId: request.node_id,
      hostname: request.hostname,
      scheme: request.scheme,
      port: request.port,
      healthSnapshot: mapGrpcHealthSnapshotToDomainDataNodeHealthSnapshot(request.health_snapshot)
    });
  });
};
