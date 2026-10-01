import type { Prisma, PrismaClient } from '@prisma/client';

import { mapPrismaError, type PrismaErrorMapperOverrides } from '@/database/prisma/error.mapper';
import { CLUSTER_RECORD_ID } from '@/modules/cluster/cluster.domain';

import type {
  ApplyMasterNodeRegistrationRepositoryInput,
  TransitionMasterNodeModeRepositoryInput
} from './master-node.application';
import type { MasterNode, MasterNodeId } from './master-node.domain';
import { mapPrismaMasterNodeToDomainMasterNode } from './master-node.mappers';

/* contract */

type MasterNodeRepositoryContract = {
  listAll(): Promise<MasterNode[]>;
  findById(id: MasterNodeId): Promise<MasterNode | null>;
  findMemberById(id: MasterNodeId): Promise<MasterNode | null>;
  applyRegistration(
    input: ApplyMasterNodeRegistrationRepositoryInput,
    tx?: Prisma.TransactionClient
  ): Promise<MasterNode>;
  transitionMode(input: TransitionMasterNodeModeRepositoryInput, tx?: Prisma.TransactionClient): Promise<boolean>;
};

/* repository */

const errorMap: PrismaErrorMapperOverrides = {};

class MasterNodeRepository implements MasterNodeRepositoryContract {
  constructor(private readonly prisma: PrismaClient) {}

  async listAll(): Promise<MasterNode[]> {
    let masterNodes;

    try {
      masterNodes = await this.prisma.masterNode.findMany({
        where: {
          cluster_record_id: CLUSTER_RECORD_ID,
          removed_at: null
        },
        orderBy: {
          id: 'asc'
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return masterNodes.map(mapPrismaMasterNodeToDomainMasterNode);
  }

  async findById(id: MasterNodeId): Promise<MasterNode | null> {
    let masterNode;

    try {
      masterNode = await this.prisma.masterNode.findUnique({
        where: {
          id
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return masterNode ? mapPrismaMasterNodeToDomainMasterNode(masterNode) : null;
  }

  async findMemberById(id: MasterNodeId): Promise<MasterNode | null> {
    let masterNode;

    try {
      masterNode = await this.prisma.masterNode.findFirst({
        where: {
          id,
          cluster_record_id: CLUSTER_RECORD_ID,
          removed_at: null
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return masterNode ? mapPrismaMasterNodeToDomainMasterNode(masterNode) : null;
  }

  async applyRegistration(
    input: ApplyMasterNodeRegistrationRepositoryInput,
    tx?: Prisma.TransactionClient
  ): Promise<MasterNode> {
    let masterNode;

    try {
      const client = tx ?? this.prisma;

      masterNode = await client.masterNode.upsert({
        where: {
          id: input.id
        },
        create: {
          id: input.id,
          cluster_record_id: CLUSTER_RECORD_ID,

          certificate_fingerprint: input.certificateFingerprint,
          session_id: input.sessionId,
          state: input.state,
          mode: input.mode,

          hostname: input.endpoint.hostname,
          port: input.endpoint.port,
          scheme: input.endpoint.scheme,

          last_contact_at: input.lastContactAt,
          last_heartbeat_at: null,
          removed_at: null
        },
        update: {
          cluster_record_id: CLUSTER_RECORD_ID,

          session_id: input.sessionId,
          state: input.state,
          mode: input.mode,

          hostname: input.endpoint.hostname,
          port: input.endpoint.port,
          scheme: input.endpoint.scheme,

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

    return mapPrismaMasterNodeToDomainMasterNode(masterNode);
  }

  async transitionMode(
    input: TransitionMasterNodeModeRepositoryInput,
    tx?: Prisma.TransactionClient
  ): Promise<boolean> {
    let transitionResult;

    try {
      const client = tx ?? this.prisma;

      transitionResult = await client.masterNode.updateMany({
        where: {
          id: input.id,
          cluster_record_id: CLUSTER_RECORD_ID,
          removed_at: null,
          mode: input.from,
          revision: input.expectedRevision
        },
        data: {
          mode: input.to,
          revision: {
            increment: 1
          }
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return transitionResult.count === 1;
  }
}

/* exports */

export { MasterNodeRepository };
export type { MasterNodeRepositoryContract };
