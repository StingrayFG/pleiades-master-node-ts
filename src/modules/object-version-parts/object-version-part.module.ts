import type { PrismaClient } from '@prisma/client';

import type { BlobServiceContract } from '@/modules/blobs/blob.service';
import type { DataNodeServiceContract } from '@/modules/data-nodes/data-node.service';

import { ObjectVersionPartRepository } from './object-version-part.repository';
import { ObjectVersionPartService } from './object-version-part.service';

/* module */

type ObjectVersionPartModuleDependencies = {
  prisma: PrismaClient;
  dataNodeService: DataNodeServiceContract;
  blobService: BlobServiceContract;
};

type ObjectVersionPartModule = {
  repository: ObjectVersionPartRepository;
  service: ObjectVersionPartService;
};

const createObjectVersionPartModule = ({
  prisma,
  dataNodeService,
  blobService
}: ObjectVersionPartModuleDependencies): ObjectVersionPartModule => {
  const repository = new ObjectVersionPartRepository(prisma);

  const service = new ObjectVersionPartService(repository, dataNodeService, blobService);

  return {
    repository,
    service
  };
};

/* exports */

export { createObjectVersionPartModule };
export type { ObjectVersionPartModule, ObjectVersionPartModuleDependencies };
