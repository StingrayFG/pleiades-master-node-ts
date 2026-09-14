import type { PrismaClient } from '@prisma/client';

import { ConsensusStateRepository } from './consensus.repository';
import { ConsensusService } from './consensus.service';

/* contract */

type ConsensusModuleDependencies = {
  prisma: PrismaClient;
};

type ConsensusModule = {
  repository: ConsensusStateRepository;
  service: ConsensusService;
};

/* module */

const createConsensusModule = ({ prisma }: ConsensusModuleDependencies): ConsensusModule => {
  const repository = new ConsensusStateRepository(prisma);

  const service = new ConsensusService(repository);

  return {
    repository,
    service
  };
};

/* exports */

export { createConsensusModule };
export type { ConsensusModule, ConsensusModuleDependencies };
