import type { PrismaClient } from '@prisma/client';

import { mapPrismaError, type PrismaErrorMapperOverrides } from '@/database/prisma/error-mapper';
import { isUniqueConstraintError } from '@/database/prisma/error-predicates';
import { GenericConflictError } from '@/errors/application.errors';
import { CLUSTER_RECORD_ID } from '@/modules/cluster/cluster.domain';

import type {
  ApplyDataNodeRegistrationRepositoryInput,
  ApplyHeartbeatRepositoryInput,
  RecordDataNodeHealthCheckRepositoryInput,
  UpdateDataNodeStateRepositoryInput
} from './data-node.application';
import type { DataNode, DataNodeId } from './data-node.domain';
import { mapPrismaDataNodeToDomainDataNode } from './data-node.mappers';

/* contract */

type DataNodeRepositoryContract = {
  listAll(): Promise<DataNode[]>;
  listAvailable(): Promise<DataNode[]>;
  findById(id: DataNodeId): Promise<DataNode | null>;
  findMemberById(id: DataNodeId): Promise<DataNode | null>;
  applyRegistration(input: ApplyDataNodeRegistrationRepositoryInput): Promise<boolean>;
  applyHeartbeat(input: ApplyHeartbeatRepositoryInput): Promise<boolean>;
  applyHealthCheck(input: RecordDataNodeHealthCheckRepositoryInput): Promise<boolean>;
  updateStateIfRevisionUnchanged(input: UpdateDataNodeStateRepositoryInput): Promise<boolean>;
};

/* repository */

const errorMap: PrismaErrorMapperOverrides = {};

class DataNodeRepository implements DataNodeRepositoryContract {
  constructor(private readonly prisma: PrismaClient) {}

  async listAll(): Promise<DataNode[]> {
    let dataNodes;

    try {
      dataNodes = await this.prisma.dataNode.findMany({
        where: {
          cluster_record_id: CLUSTER_RECORD_ID,
          removed_at: null
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return dataNodes.map(mapPrismaDataNodeToDomainDataNode);
  }

  async listAvailable(): Promise<DataNode[]> {
    let dataNodes;

    try {
      dataNodes = await this.prisma.dataNode.findMany({
        where: {
          cluster_record_id: CLUSTER_RECORD_ID,
          removed_at: null,
          state: 'active',
          mode: 'serving'
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return dataNodes.map(mapPrismaDataNodeToDomainDataNode);
  }

  async findById(id: DataNodeId): Promise<DataNode | null> {
    let dataNode;

    try {
      dataNode = await this.prisma.dataNode.findUnique({
        where: {
          id
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    if (!dataNode) {
      return null;
    }

    return mapPrismaDataNodeToDomainDataNode(dataNode);
  }

  async findMemberById(id: DataNodeId): Promise<DataNode | null> {
    let dataNode;

    try {
      dataNode = await this.prisma.dataNode.findFirst({
        where: {
          id,
          cluster_record_id: CLUSTER_RECORD_ID,
          removed_at: null
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return dataNode ? mapPrismaDataNodeToDomainDataNode(dataNode) : null;
  }

  async applyRegistration(input: ApplyDataNodeRegistrationRepositoryInput): Promise<boolean> {
    if (input.expectedRevision === null) {
      try {
        await this.prisma.dataNode.create({
          data: {
            id: input.id,
            cluster_record_id: CLUSTER_RECORD_ID,

            certificate_fingerprint: input.certificateFingerprint,
            session_id: input.sessionId,
            last_heartbeat_sequence: 0n,
            state: input.state,
            mode: 'serving',

            hostname: input.endpoint.hostname,
            port: input.endpoint.port,
            scheme: input.endpoint.scheme,

            storage_total_bytes: input.storageTotalBytes,
            storage_free_bytes: input.storageFreeBytes,

            last_contact_at: input.lastContactAt,
            last_heartbeat_at: null,
            removed_at: null
          }
        });
      } catch (err) {
        if (isUniqueConstraintError(err, 'id')) {
          return false;
        }

        if (isUniqueConstraintError(err, 'certificate_fingerprint')) {
          throw new GenericConflictError('Data node certificate is already registered');
        }

        throw mapPrismaError(err, errorMap) ?? err;
      }

      return true;
    }

    let registrationUpdateResult;

    try {
      registrationUpdateResult = await this.prisma.dataNode.updateMany({
        where: {
          id: input.id,

          revision: input.expectedRevision
        },
        data: {
          cluster_record_id: CLUSTER_RECORD_ID,

          session_id: input.sessionId,
          last_heartbeat_sequence: 0n,
          state: input.state,

          hostname: input.endpoint.hostname,
          port: input.endpoint.port,
          scheme: input.endpoint.scheme,

          storage_total_bytes: input.storageTotalBytes,
          storage_free_bytes: input.storageFreeBytes,

          last_contact_at: input.lastContactAt,
          last_heartbeat_at: null,
          removed_at: null,

          revision: {
            increment: 1
          }
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return registrationUpdateResult.count === 1;
  }

  async applyHeartbeat(input: ApplyHeartbeatRepositoryInput): Promise<boolean> {
    let heartbeatUpdateResult;

    try {
      heartbeatUpdateResult = await this.prisma.dataNode.updateMany({
        where: {
          id: input.id,
          cluster_record_id: CLUSTER_RECORD_ID,
          removed_at: null,

          certificate_fingerprint: input.certificateFingerprint,
          session_id: input.sessionId,
          last_heartbeat_sequence: {
            lt: input.heartbeatSequence
          }
        },
        data: {
          state: input.state,
          last_heartbeat_sequence: input.heartbeatSequence,

          storage_total_bytes: input.storageTotalBytes,
          storage_free_bytes: input.storageFreeBytes,

          last_contact_at: input.lastContactAt,
          last_heartbeat_at: input.lastHeartbeatAt,

          revision: {
            increment: 1
          }
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return heartbeatUpdateResult.count === 1;
  }

  async applyHealthCheck(input: RecordDataNodeHealthCheckRepositoryInput): Promise<boolean> {
    let healthCheckUpdateResult;

    try {
      healthCheckUpdateResult = await this.prisma.dataNode.updateMany({
        where: {
          id: input.id,
          cluster_record_id: CLUSTER_RECORD_ID,
          removed_at: null,

          revision: input.expectedRevision
        },
        data: {
          last_health_check_at: input.lastHealthCheckAt,

          revision: {
            increment: 1
          }
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return healthCheckUpdateResult.count === 1;
  }

  async updateStateIfRevisionUnchanged(input: UpdateDataNodeStateRepositoryInput): Promise<boolean> {
    let stateUpdateResult;

    try {
      stateUpdateResult = await this.prisma.dataNode.updateMany({
        where: {
          id: input.id,
          cluster_record_id: CLUSTER_RECORD_ID,
          removed_at: null,

          revision: input.expectedRevision
        },
        data: {
          state: input.state,

          revision: {
            increment: 1
          }
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return stateUpdateResult.count === 1;
  }
}

/* exports */

export { DataNodeRepository };
export type { DataNodeRepositoryContract };
