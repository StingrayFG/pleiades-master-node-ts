import type { FastifyBaseLogger } from 'fastify';

import prisma from '@/database/prisma/prisma.client';
import env from '@/env';

import { createBackgroundModule } from '@/modules/background/background.module';
import type { BlobConfig } from '@/modules/blobs/blob.config';
import { createBlobGrpcConfig } from '@/modules/blobs/blob.grpc-config';
import { createBlobModule } from '@/modules/blobs/blob.module';
import { createBucketModule } from '@/modules/buckets/bucket.module';
import { createDataNodeModule } from '@/modules/data-nodes/data-node.module';
import { partConfig } from '@/modules/object-version-parts/object-version-part.config';
import { createObjectVersionPartModule } from '@/modules/object-version-parts/object-version-part.module';
import { createObjectModule } from '@/modules/objects/object.module';

/* contract */

type CreateCompositionRootInput = {
  logger: FastifyBaseLogger;
};

type CompositionRoot = {
  bucketModule: ReturnType<typeof createBucketModule>;
  dataNodeModule: ReturnType<typeof createDataNodeModule>;
  blobModule: ReturnType<typeof createBlobModule>;
  objectVersionPartModule: ReturnType<typeof createObjectVersionPartModule>;
  objectModule: ReturnType<typeof createObjectModule>;
  backgroundModule: ReturnType<typeof createBackgroundModule>;

  close(): Promise<void>;
};

/* factory */

const createCompositionRoot = ({ logger }: CreateCompositionRootInput): CompositionRoot => {
  const blobConfig: BlobConfig = {
    maxSizeBytes: BigInt(env.BLOB_SIZE_LIMIT_BYTES)
  };

  const bucketModule = createBucketModule({
    prisma
  });

  const dataNodeModule = createDataNodeModule({
    prisma
  });

  const blobModule = createBlobModule({
    blobConfig,
    grpcConfig: createBlobGrpcConfig(blobConfig)
  });

  const objectVersionPartModule = createObjectVersionPartModule({
    prisma,
    blobConfig,
    partConfig,
    dataNodeService: dataNodeModule.service,
    blobService: blobModule.service
  });

  const objectModule = createObjectModule({
    prisma,
    bucketService: bucketModule.service,
    objectVersionPartRepository: objectVersionPartModule.repository,
    objectVersionPartService: objectVersionPartModule.service
  });

  const backgroundModule = createBackgroundModule({
    dataNodeLifecycleHandler: dataNodeModule.lifecycleHandler,
    objectVersionPartLifecycleHandler: objectVersionPartModule.lifecycleHandler,
    objectLifecycleHandler: objectModule.lifecycleHandler,
    logger
  });

  const close = async (): Promise<void> => {
    await Promise.all([
      backgroundModule.dataNodeLifecycleWorker.stop(),
      backgroundModule.objectVersionPartLifecycleWorker.stop(),
      backgroundModule.objectLifecycleWorker.stop()
    ]);

    dataNodeModule.grpcClient.close();
    blobModule.grpcClient.close();

    await prisma.$disconnect();
  };

  return {
    bucketModule,
    dataNodeModule,
    blobModule,
    objectVersionPartModule,
    objectModule,
    backgroundModule,
    close
  };
};

export { createCompositionRoot };
export type { CompositionRoot };
