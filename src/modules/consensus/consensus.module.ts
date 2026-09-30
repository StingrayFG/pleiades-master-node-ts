import type { PrismaClient } from '@prisma/client';

import type { MasterNodeId } from '@/modules/master-nodes/master-node.domain';

import { ConsensusStateRepository } from './consensus.repository';
import { ConsensusService } from './consensus.service';

/* contract */

type ConsensusModuleDependencies = {
  prisma: PrismaClient;
  selfMasterNodeId: MasterNodeId;
};

type ConsensusModule = {
  repository: ConsensusStateRepository;
  service: ConsensusService;
};

/* module */

const createConsensusModule = ({ prisma, selfMasterNodeId }: ConsensusModuleDependencies): ConsensusModule => {
  const repository = new ConsensusStateRepository(prisma);

  const service = new ConsensusService(repository, selfMasterNodeId);

  return {
    repository,
    service
  };
};

/* exports */

export { createConsensusModule };
export type { ConsensusModule, ConsensusModuleDependencies };
