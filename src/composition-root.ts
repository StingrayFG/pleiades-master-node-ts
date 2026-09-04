import type { FastifyBaseLogger } from 'fastify';

import prisma from '@/database/prisma/prisma.client';
import { MtlsGrpcClientCredentials } from '@/transports/grpc/client/credentials/mtls-grpc-client-credentials';
import { loadGrpcMtlsConfig } from '@/transports/grpc/config/grpc-mtls.loader';
import type { GrpcServerCredentialsContract } from '@/transports/grpc/server/credentials/grpc-server-credentials.contract';
import { MtlsGrpcServerCredentials } from '@/transports/grpc/server/credentials/mtls-grpc-server-credentials';

import { createBackgroundModule } from '@/modules/background/background.module';
import { blobConfig } from '@/modules/blobs/blob.config';
import { blobGrpcConfig } from '@/modules/blobs/blob.grpc-config';
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
  grpcServerCredentials: GrpcServerCredentialsContract;

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
  const grpcMtlsConfig = loadGrpcMtlsConfig();

  const grpcClientCredentials = new MtlsGrpcClientCredentials(grpcMtlsConfig);
  const grpcServerCredentials = new MtlsGrpcServerCredentials(grpcMtlsConfig);

  const bucketModule = createBucketModule({
    prisma
  });

  const dataNodeModule = createDataNodeModule({
    prisma,
    grpcClientCredentials
  });

  const blobModule = createBlobModule({
    blobConfig,
    grpcClientCredentials,
    grpcConfig: blobGrpcConfig
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
    dataNodeModule.grpcClient.close();
    blobModule.grpcClient.close();

    await prisma.$disconnect();
  };

  return {
    grpcServerCredentials,
    bucketModule,
    dataNodeModule,
    blobModule,
    objectVersionPartModule,
    objectModule,
    backgroundModule,
    close
  };
};

/* exports */

export { createCompositionRoot };
export type { CompositionRoot };
