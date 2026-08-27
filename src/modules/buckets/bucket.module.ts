import type { PrismaClient } from '@prisma/client';

import { BucketController } from './bucket.http-controller';
import { BucketRepository } from './bucket.repository';
import { BucketService } from './bucket.service';

/* contract */

type BucketModuleDependencies = {
  prisma: PrismaClient;
};

type BucketModule = {
  repository: BucketRepository;
  service: BucketService;
  controller: BucketController;
};

/* module */

const createBucketModule = ({ prisma }: BucketModuleDependencies): BucketModule => {
  const repository = new BucketRepository(prisma);

  const service = new BucketService(repository);

  const controller = new BucketController(service);

  return {
    repository,
    service,
    controller
  };
};

/* exports */

export { createBucketModule };

export type { BucketModule, BucketModuleDependencies };
