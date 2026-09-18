import type { PrismaClient } from '@prisma/client';

import { MasterNodeRepository } from './master-node.repository';
import { MasterNodeService } from './master-node.service';

/* contract */

type MasterNodeModuleDependencies = {
  prisma: PrismaClient;
};

type MasterNodeModule = {
  repository: MasterNodeRepository;
  service: MasterNodeService;
};

/* module */

const createMasterNodeModule = ({ prisma }: MasterNodeModuleDependencies): MasterNodeModule => {
  const repository = new MasterNodeRepository(prisma);

  const service = new MasterNodeService(repository);

  return {
    repository,
    service
  };
};

/* exports */

export { createMasterNodeModule };
export type { MasterNodeModule, MasterNodeModuleDependencies };
