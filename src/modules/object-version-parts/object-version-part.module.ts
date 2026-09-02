import type { PrismaClient } from '@prisma/client';

import type { BlobServiceContract } from '@/modules/blobs/blob.service';
import type { DataNodeServiceContract } from '@/modules/data-nodes/data-node.service';

import { ObjectVersionPartLifecycleHandler } from './lifecycle/object-version-part.lifecycle-handler';
import { PartReplicaDeletionHandler } from './lifecycle/part-replica-deletion.handler';
import { PartReplicaRepairHandler } from './lifecycle/part-replica-repair.handler';
import { PartReplicaVerificationHandler } from './lifecycle/part-replica-verification.handler';
import { PendingPartReplicaReconciliationHandler } from './lifecycle/pending-part-replica-reconciliation.handler';
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
  lifecycleHandler: ObjectVersionPartLifecycleHandler;
};

const createObjectVersionPartModule = ({
  prisma,
  dataNodeService,
  blobService
}: ObjectVersionPartModuleDependencies): ObjectVersionPartModule => {
  const repository = new ObjectVersionPartRepository(prisma);

  const service = new ObjectVersionPartService(repository, dataNodeService, blobService);

  const partReplicaVerificationHandler = new PartReplicaVerificationHandler(repository, dataNodeService, blobService);

  const pendingPartReplicaReconciliationHandler = new PendingPartReplicaReconciliationHandler(
    repository,
    dataNodeService,
    blobService
  );

  const partReplicaRepairHandler = new PartReplicaRepairHandler(repository, dataNodeService, blobService);

  const partReplicaDeletionHandler = new PartReplicaDeletionHandler(repository, dataNodeService, blobService);

  const lifecycleHandler = new ObjectVersionPartLifecycleHandler(
    partReplicaVerificationHandler,
    pendingPartReplicaReconciliationHandler,
    partReplicaRepairHandler,
    partReplicaDeletionHandler
  );

  return {
    repository,
    service,
    lifecycleHandler
  };
};

/* exports */

export { createObjectVersionPartModule };
export type { ObjectVersionPartModule, ObjectVersionPartModuleDependencies };
