import type { PrismaClient } from '@prisma/client';

import type { BlobConfig } from '@/modules/blobs/blob.config';
import type { BlobGrpcClientContract } from '@/modules/blobs/blob.grpc-client';
import type { BlobServiceContract } from '@/modules/blobs/blob.service';
import type { DataNodeServiceContract } from '@/modules/data-nodes/data-node.service';

import { ObjectVersionPartLifecycleHandler } from './lifecycle/object-version-part.lifecycle-handler';
import { PartReplicaDeletionHandler } from './lifecycle/part-replica-deletion.handler';
import { PartReplicaRepairHandler } from './lifecycle/part-replica-repair.handler';
import { PartReplicaVerificationHandler } from './lifecycle/part-replica-verification.handler';
import { PendingPartReplicaReconciliationHandler } from './lifecycle/pending-part-replica-reconciliation.handler';
import type { PartConfig } from './object-version-part.config';
import { ObjectVersionPartRepository } from './object-version-part.repository';
import { ObjectVersionPartService } from './object-version-part.service';
import { ObjectVersionPartTaskHandler } from './object-version-part.task-handler';

/* module */

type ObjectVersionPartModuleDependencies = {
  prisma: PrismaClient;
  blobConfig: BlobConfig;
  partConfig: PartConfig;
  dataNodeService: DataNodeServiceContract;
  blobService: BlobServiceContract;
  blobGrpcClient: BlobGrpcClientContract;
};

type ObjectVersionPartModule = {
  repository: ObjectVersionPartRepository;
  service: ObjectVersionPartService;
  taskHandler: ObjectVersionPartTaskHandler;
  lifecycleHandler: ObjectVersionPartLifecycleHandler;
};

const createObjectVersionPartModule = ({
  prisma,
  blobConfig,
  partConfig,
  dataNodeService,
  blobService,
  blobGrpcClient
}: ObjectVersionPartModuleDependencies): ObjectVersionPartModule => {
  const repository = new ObjectVersionPartRepository(prisma);

  const service = new ObjectVersionPartService(repository, dataNodeService, blobService);

  const taskHandler = new ObjectVersionPartTaskHandler(repository, dataNodeService, blobGrpcClient, blobConfig, partConfig);

  const partReplicaVerificationHandler = new PartReplicaVerificationHandler(
    repository,
    dataNodeService,
    blobService,
    partConfig
  );

  const pendingPartReplicaReconciliationHandler = new PendingPartReplicaReconciliationHandler(
    repository,
    dataNodeService,
    blobService,
    partConfig
  );

  const partReplicaRepairHandler = new PartReplicaRepairHandler(repository, dataNodeService, blobService, partConfig);

  const partReplicaDeletionHandler = new PartReplicaDeletionHandler(
    repository,
    dataNodeService,
    blobService,
    partConfig
  );

  const lifecycleHandler = new ObjectVersionPartLifecycleHandler(
    partReplicaVerificationHandler,
    pendingPartReplicaReconciliationHandler,
    partReplicaRepairHandler,
    partReplicaDeletionHandler
  );

  return {
    repository,
    service,
    taskHandler,
    lifecycleHandler
  };
};

/* exports */

export { createObjectVersionPartModule };
export type { ObjectVersionPartModule, ObjectVersionPartModuleDependencies };
