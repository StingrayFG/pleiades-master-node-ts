import type { PrismaClient } from '@prisma/client';

import { mapPrismaError, type PrismaErrorMapperOverrides } from '@/database/prisma/error-mapper';

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
  applyRegistration(input: ApplyMasterNodeRegistrationRepositoryInput): Promise<MasterNode>;
  transitionMode(input: TransitionMasterNodeModeRepositoryInput): Promise<boolean>;
};

/* repository */

const errorMap: PrismaErrorMapperOverrides = {};

class MasterNodeRepository implements MasterNodeRepositoryContract {
  constructor(private readonly prisma: PrismaClient) {}

  async listAll(): Promise<MasterNode[]> {
    let masterNodes;

    try {
      masterNodes = await this.prisma.masterNode.findMany({
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

  async applyRegistration(input: ApplyMasterNodeRegistrationRepositoryInput): Promise<MasterNode> {
    let masterNode;

    try {
      masterNode = await this.prisma.masterNode.upsert({
        where: {
          id: input.id
        },
        create: {
          id: input.id,

          certificate_fingerprint: input.certificateFingerprint,
          session_id: input.sessionId,
          state: input.state,
          mode: input.mode,

          hostname: input.endpoint.hostname,
          port: input.endpoint.port,
          scheme: input.endpoint.scheme,

          last_contact_at: input.lastContactAt,
          last_heartbeat_at: null
        },
        update: {
          session_id: input.sessionId,
          state: input.state,
          mode: input.mode,

          hostname: input.endpoint.hostname,
          port: input.endpoint.port,
          scheme: input.endpoint.scheme,

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

    return mapPrismaMasterNodeToDomainMasterNode(masterNode);
  }

  async transitionMode(input: TransitionMasterNodeModeRepositoryInput): Promise<boolean> {
    let transitionResult;

    try {
      transitionResult = await this.prisma.masterNode.updateMany({
        where: {
          id: input.id,
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
