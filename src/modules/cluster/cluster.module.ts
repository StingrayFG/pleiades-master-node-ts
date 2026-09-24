import type { PrismaClient } from '@prisma/client';

import { ClusterRepository } from './cluster.repository';
import { ClusterService } from './cluster.service';

/* contract */

type ClusterModuleDependencies = {
  prisma: PrismaClient;
};

type ClusterModule = {
  repository: ClusterRepository;
  service: ClusterService;
};

/* module */

const createClusterModule = ({ prisma }: ClusterModuleDependencies): ClusterModule => {
  const repository = new ClusterRepository(prisma);

  const service = new ClusterService(repository);

  return {
    repository,
    service
  };
};

/* exports */

export { createClusterModule };
export type { ClusterModule, ClusterModuleDependencies };
