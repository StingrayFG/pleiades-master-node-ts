import type { DataNode as PrismaDataNode } from '@prisma/client';

import { wrapMapping } from '@/common/mappers/mapping';
import { parseByteCount } from '@/common/parsers/parsers';
import { GenericMappingError } from '@/errors/application.errors';
import type { RecordDataNodeHeartbeatRequest, RegisterDataNodeRequest } from '@/gen/proto/membership/v1/membership';
import { healthSnapshotStatusToJSON, type HealthSnapshot as GrpcHealthSnapshot } from '@/gen/proto/status/v1/status';

import {
  heartbeatDataNodeInputSchema,
  type HeartbeatDataNodeInput,
  registerDataNodeInputSchema,
  type RegisterDataNodeInput
} from './data-node.application';
import {
  dataNodeEndpointSchema,
  dataNodeHealthSnapshotSchema,
  dataNodeSchema,
  type DataNode,
  type DataNodeEndpoint,
  type DataNodeHealthSnapshot,
  type DataNodeHealthSnapshotStatus
} from './data-node.domain';

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

export const mapGrpcRecordDataNodeHeartbeatRequestToHeartbeatDataNodeInput = (
  request: RecordDataNodeHeartbeatRequest
): HeartbeatDataNodeInput => {
  return wrapMapping('Failed to map gRPC record data node heartbeat request to heartbeat data node input', () => {
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

export const mapDataNodeToDataNodeEndpoint = (dataNode: DataNode): DataNodeEndpoint => {
  return wrapMapping('Failed to map data node to data node endpoint', () =>
    dataNodeEndpointSchema.parse({
      hostname: dataNode.hostname,
      port: dataNode.port,
      scheme: dataNode.scheme
    })
  );
};

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
