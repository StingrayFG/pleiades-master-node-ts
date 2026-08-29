import type { PrismaClient } from '@prisma/client';

import { mapPrismaError, type PrismaErrorMapperOverrides } from '@/database/prisma/error-mapper';

import type { ApplyHeartbeatRepositoryInput, UpsertDataNodeRepositoryInput } from './data-node.application';
import type { DataNode, DataNodeId } from './data-node.domain';
import { mapPrismaDataNodeToDomainDataNode } from './data-node.mappers';

/* contract */

type DataNodeRepositoryContract = {
  findAllActive(): Promise<DataNode[]>;
  findById(id: DataNodeId): Promise<DataNode | null>;
  upsert(input: UpsertDataNodeRepositoryInput): Promise<DataNode>;
  applyHeartbeat(input: ApplyHeartbeatRepositoryInput): Promise<DataNode>;
};

/* repository */

const errorMap: PrismaErrorMapperOverrides = {};

class DataNodeRepository implements DataNodeRepositoryContract {
  constructor(private readonly prisma: PrismaClient) {}

  async findAllActive(): Promise<DataNode[]> {
    let dataNodes;

    try {
      dataNodes = await this.prisma.dataNode.findMany({
        where: {
          state: 'active'
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
          node_id: id
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

  async upsert(input: UpsertDataNodeRepositoryInput): Promise<DataNode> {
    let dataNode;

    try {
      dataNode = await this.prisma.dataNode.upsert({
        where: {
          node_id: input.id
        },
        update: {
          hostname: input.hostname,
          port: input.port,
          scheme: input.scheme,
          state: input.state,
          storage_total_bytes: input.storageTotalBytes,
          storage_free_bytes: input.storageFreeBytes,
          last_heartbeat_at: input.lastHeartbeatAt
        },
        create: {
          node_id: input.id,
          hostname: input.hostname,
          port: input.port,
          scheme: input.scheme,
          state: 'joining',
          storage_total_bytes: input.storageTotalBytes,
          storage_free_bytes: input.storageFreeBytes,
          last_heartbeat_at: input.lastHeartbeatAt
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return mapPrismaDataNodeToDomainDataNode(dataNode);
  }

  async applyHeartbeat(input: ApplyHeartbeatRepositoryInput): Promise<DataNode> {
    let dataNode;

    try {
      dataNode = await this.prisma.dataNode.update({
        where: {
          node_id: input.id
        },
        data: {
          state: input.state,
          storage_total_bytes: input.storageTotalBytes,
          storage_free_bytes: input.storageFreeBytes,
          last_heartbeat_at: input.lastHeartbeatAt
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return mapPrismaDataNodeToDomainDataNode(dataNode);
  }
}

/* exports */

export { DataNodeRepository };
export type { DataNodeRepositoryContract };
