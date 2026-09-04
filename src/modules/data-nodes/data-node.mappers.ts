import type { DataNode as PrismaDataNode } from '@prisma/client';

import { parseByteCount, withMapperError } from '@/common/mappers/mappers';
import { GenericMapperError } from '@/errors/application.errors';
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

/* grpc -> domain */

export const mapGrpcHealthSnapshotStatusToDomainDataNodeHealthSnapshotStatus = (
  status: GrpcHealthSnapshot['status']
): DataNodeHealthSnapshotStatus => {
  return withMapperError('Failed to map gRPC health snapshot status to domain health snapshot status', () => {
    const grpcHealthSnapshotStatus = healthSnapshotStatusToJSON(status);

    switch (grpcHealthSnapshotStatus) {
      case 'HEALTH_SNAPSHOT_STATUS_HEALTHY':
        return 'healthy';

      case 'HEALTH_SNAPSHOT_STATUS_DEGRADED':
        return 'degraded';

      default:
        throw new GenericMapperError('Invalid health snapshot status');
    }
  });
};

export const mapGrpcHealthSnapshotToDomainDataNodeHealthSnapshot = (
  healthSnapshot: GrpcHealthSnapshot
): DataNodeHealthSnapshot => {
  return withMapperError('Failed to map gRPC health snapshot to domain data node health snapshot', () =>
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

/* grpc -> application */

export const mapGrpcRecordDataNodeHeartbeatRequestToHeartbeatDataNodeInput = (
  request: RecordDataNodeHeartbeatRequest,
  certificateFingerprint: HeartbeatDataNodeInput['certificateFingerprint']
): HeartbeatDataNodeInput => {
  return withMapperError('Failed to map gRPC record data node heartbeat request to heartbeat data node input', () => {
    if (!request.health_snapshot) {
      throw new GenericMapperError('Health snapshot is required');
    }

    return heartbeatDataNodeInputSchema.parse({
      id: request.node_id,

      certificateFingerprint,
      sessionId: request.session_id,
      heartbeatSequence: request.heartbeat_sequence,

      healthSnapshot: mapGrpcHealthSnapshotToDomainDataNodeHealthSnapshot(request.health_snapshot)
    });
  });
};

export const mapGrpcRegisterDataNodeRequestToRegisterDataNodeInput = (
  request: RegisterDataNodeRequest,
  certificateFingerprint: RegisterDataNodeInput['certificateFingerprint']
): RegisterDataNodeInput => {
  return withMapperError('Failed to map gRPC register data node request to register data node input', () => {
    if (!request.health_snapshot) {
      throw new GenericMapperError('Health snapshot is required');
    }

    return registerDataNodeInputSchema.parse({
      id: request.node_id,

      certificateFingerprint,

      endpoint: {
        hostname: request.hostname,
        port: request.port,
        scheme: request.scheme
      },

      healthSnapshot: mapGrpcHealthSnapshotToDomainDataNodeHealthSnapshot(request.health_snapshot)
    });
  });
};

/* domain */

export const mapDataNodeToDataNodeEndpoint = (dataNode: DataNode): DataNodeEndpoint => {
  return withMapperError('Failed to map data node to data node endpoint', () =>
    dataNodeEndpointSchema.parse({
      hostname: dataNode.hostname,
      port: dataNode.port,
      scheme: dataNode.scheme
    })
  );
};

/* prisma -> domain */

export const mapPrismaDataNodeToDomainDataNode = (dataNode: PrismaDataNode): DataNode => {
  return withMapperError('Failed to map Prisma data node to domain data node', () =>
    dataNodeSchema.parse({
      id: dataNode.id,

      certificateFingerprint: dataNode.certificate_fingerprint,
      sessionId: dataNode.session_id,
      state: dataNode.state,
      mode: dataNode.mode,

      hostname: dataNode.hostname,
      port: dataNode.port,
      scheme: dataNode.scheme,

      storageTotalBytes: dataNode.storage_total_bytes,
      storageFreeBytes: dataNode.storage_free_bytes,

      registeredAt: dataNode.registered_at,
      lastContactAt: dataNode.last_contact_at,
      lastHealthCheckAt: dataNode.last_health_check_at,
      lastHeartbeatAt: dataNode.last_heartbeat_at,
      updatedAt: dataNode.updated_at,

      revision: dataNode.revision
    })
  );
};
