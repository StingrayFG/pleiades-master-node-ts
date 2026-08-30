import type { PrismaClient } from '@prisma/client';

import { mapPrismaError, type PrismaErrorMapperOverrides } from '@/database/prisma/error-mapper';
import { isUniqueConstraintError } from '@/database/prisma/error-predicates';

import type {
  ApplyHeartbeatRepositoryInput,
  ApplyDataNodeRegistrationRepositoryInput,
  UpdateDataNodeStateRepositoryInput,
  RecordDataNodeHealthCheckRepositoryInput
} from './data-node.application';
import type { DataNode, DataNodeId } from './data-node.domain';
import { mapPrismaDataNodeToDomainDataNode } from './data-node.mappers';

/* contract */

type DataNodeRepositoryContract = {
  listAll(): Promise<DataNode[]>;
  listAvailable(): Promise<DataNode[]>;
  findById(id: DataNodeId): Promise<DataNode | null>;
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
      dataNodes = await this.prisma.dataNode.findMany();
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

  async applyRegistration(input: ApplyDataNodeRegistrationRepositoryInput): Promise<boolean> {
    if (input.expectedRevision === null) {
      try {
        await this.prisma.dataNode.create({
          data: {
            id: input.id,
            hostname: input.endpoint.hostname,
            port: input.endpoint.port,
            scheme: input.endpoint.scheme,

            session_id: input.sessionId,
            last_heartbeat_sequence: 0n,
            state: input.state,
            mode: 'serving',

            storage_total_bytes: input.storageTotalBytes,
            storage_free_bytes: input.storageFreeBytes,

            last_contact_at: input.lastContactAt,
            last_heartbeat_at: null
          }
        });
      } catch (err) {
        if (isUniqueConstraintError(err)) {
          return false;
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
          hostname: input.endpoint.hostname,
          port: input.endpoint.port,
          scheme: input.endpoint.scheme,

          session_id: input.sessionId,
          last_heartbeat_sequence: 0n,
          state: input.state,

          storage_total_bytes: input.storageTotalBytes,
          storage_free_bytes: input.storageFreeBytes,

          last_contact_at: input.lastContactAt,
          last_heartbeat_at: null,

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

          session_id: input.sessionId,
          last_heartbeat_sequence: {
            lt: input.heartbeatSequence
          }
        },
        data: {
          state: input.state,

          storage_total_bytes: input.storageTotalBytes,
          storage_free_bytes: input.storageFreeBytes,

          last_contact_at: input.lastContactAt,
          last_heartbeat_at: input.lastHeartbeatAt,
          last_heartbeat_sequence: input.heartbeatSequence,

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
