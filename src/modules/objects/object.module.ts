import type { PrismaClient } from '@prisma/client';

import type { BucketServiceContract } from '@/modules/buckets/bucket.service';
import type { ObjectVersionPartServiceContract } from '@/modules/object-version-part/object-version-part.service';

import { ObjectController } from './object.http-controller';
import { ObjectRepository } from './object.repository';
import { ObjectService } from './object.service';

/* contract */

type ObjectModuleDependencies = {
  prisma: PrismaClient;
  bucketService: BucketServiceContract;
  objectVersionPartService: ObjectVersionPartServiceContract;
};

type ObjectModule = {
  repository: ObjectRepository;
  service: ObjectService;
  controller: ObjectController;
};

/* module */

const createObjectModule = ({
  prisma,
  bucketService,
  objectVersionPartService
}: ObjectModuleDependencies): ObjectModule => {
  const repository = new ObjectRepository(prisma);

  const service = new ObjectService(bucketService, repository, objectVersionPartService);

  const controller = new ObjectController(service);

  return {
    repository,
    service,
    controller
  };
};

/* exports */

export { createObjectModule };

export type { ObjectModule, ObjectModuleDependencies };
