import type { PrismaClient } from '@prisma/client';

import type { ByteStorageConfig } from './byte-storage.config';
import { ByteStorageRepository, type ByteStorageRepositoryContract } from './byte-storage.repository';
import { ByteStorageService, type ByteStorageServiceContract } from './byte-storage.service';
import type { DiskByteStorageConfig } from './disk-byte-storage.config';
import { DiskByteStorageService } from './disk-byte-storage.service';
import {
  ByteStorageLifecycleHandler,
  type ByteStorageLifecycleHandlerContract
} from './lifecycle/byte-storage.lifecycle-handler';
import { DeletingByteStorageObjectCleanupHandler } from './lifecycle/deleting-byte-storage-object-cleanup.handler';
import { OrphanedTemporaryFileCleanupHandler } from './lifecycle/orphaned-temporary-file-cleanup.handler';
import { PendingByteStorageObjectCleanupHandler } from './lifecycle/pending-byte-storage-object-cleanup.handler';

/* contract */

type ByteStorageModuleDependencies = {
  prisma: PrismaClient;
  diskByteStorageConfig: DiskByteStorageConfig;
  byteStorageConfig: ByteStorageConfig;
};

type ByteStorageModule = {
  repository: ByteStorageRepositoryContract;
  service: ByteStorageServiceContract;
  lifecycleHandler: ByteStorageLifecycleHandlerContract;
};

/* module */

const createByteStorageModule = ({
  prisma,
  diskByteStorageConfig,
  byteStorageConfig
}: ByteStorageModuleDependencies): ByteStorageModule => {
  const repository = new ByteStorageRepository(prisma);

  const diskService = new DiskByteStorageService(diskByteStorageConfig);

  const service = new ByteStorageService(repository, diskService);

  const pendingByteStorageObjectCleanupHandler = new PendingByteStorageObjectCleanupHandler(
    repository,
    diskService,
    byteStorageConfig
  );

  const deletingByteStorageObjectCleanupHandler = new DeletingByteStorageObjectCleanupHandler(
    repository,
    diskService,
    byteStorageConfig
  );

  const orphanedTemporaryFileCleanupHandler = new OrphanedTemporaryFileCleanupHandler(diskService, byteStorageConfig);

  const lifecycleHandler = new ByteStorageLifecycleHandler(
    pendingByteStorageObjectCleanupHandler,
    deletingByteStorageObjectCleanupHandler,
    orphanedTemporaryFileCleanupHandler
  );

  return {
    repository,
    service,
    lifecycleHandler
  };
};

/* exports */

export { createByteStorageModule };
export type { ByteStorageModule, ByteStorageModuleDependencies };
