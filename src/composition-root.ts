import type { FastifyBaseLogger } from 'fastify';

import prisma from '@/database/prisma/prisma.client';
import env from '@/env';
import { MtlsGrpcClientCredentials } from '@/transports/grpc/client/credentials/mtls-grpc-client-credentials';
import { loadGrpcMtlsConfig } from '@/transports/grpc/config/grpc-mtls.loader';
import type { GrpcServerCredentialsContract } from '@/transports/grpc/server/credentials/grpc-server-credentials.contract';
import { MtlsGrpcServerCredentials } from '@/transports/grpc/server/credentials/mtls-grpc-server-credentials';

import { createBackgroundModule } from '@/modules/background/background.module';
import { byteStorageConfig } from '@/modules/byte-storage/byte-storage.config';
import { createByteStorageModule } from '@/modules/byte-storage/byte-storage.module';
import type { DiskByteStorageConfig } from '@/modules/byte-storage/disk-byte-storage.config';
import { blobConfig } from '@/modules/blobs/blob.config';
import { blobGrpcConfig } from '@/modules/blobs/blob.grpc-config';
import { createBlobModule } from '@/modules/blobs/blob.module';
import { createBootstrapModule } from '@/modules/bootstrap/bootstrap.module';
import { createBucketModule } from '@/modules/buckets/bucket.module';
import { createConsensusModule } from '@/modules/consensus/consensus.module';
import { createDataNodeModule } from '@/modules/data-nodes/data-node.module';
import type { IdentityConfig } from '@/modules/identity/identity.config';
import { createIdentityModule } from '@/modules/identity/identity.module';
import { createMasterNodeModule } from '@/modules/master-nodes/master-node.module';
import { calculateMasterNodeCertificateFingerprint } from '@/modules/master-nodes/master-node.processors';
import { partConfig } from '@/modules/object-version-parts/object-version-part.config';
import { createObjectVersionPartModule } from '@/modules/object-version-parts/object-version-part.module';
import { createObjectModule } from '@/modules/objects/object.module';
import { taskConfig } from '@/modules/tasks/task.config';
import { createTaskModule } from '@/modules/tasks/task.module';
import { createUserModule } from '@/modules/users/user.module';

/* contract */

type CreateCompositionRootInput = {
  logger: FastifyBaseLogger;
};

type CompositionRoot = {
  grpcServerCredentials: GrpcServerCredentialsContract;

  identityModule: ReturnType<typeof createIdentityModule>;
  masterNodeModule: ReturnType<typeof createMasterNodeModule>;
  consensusModule: ReturnType<typeof createConsensusModule>;
  bootstrapModule: ReturnType<typeof createBootstrapModule>;
  byteStorageModule: ReturnType<typeof createByteStorageModule>;
  taskModule: ReturnType<typeof createTaskModule>;
  userModule: ReturnType<typeof createUserModule>;
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
  const identityConfig: IdentityConfig = {
    nodeIdPath: env.NODE_ID_PATH
  };

  const identityModule = createIdentityModule({
    identityConfig
  });

  const selfMasterNodeId = identityModule.service.getNodeId();
  const selfMasterNodeSessionId = identityModule.service.getNodeSessionId();

  const grpcMtlsConfig = loadGrpcMtlsConfig();

  const masterNodeModule = createMasterNodeModule({
    prisma
  });

  const consensusModule = createConsensusModule({
    prisma
  });

  const bootstrapModule = createBootstrapModule({
    consensusService: consensusModule.service,
    masterNodeService: masterNodeModule.service,
    selfMasterNode: {
      id: selfMasterNodeId,

      certificateFingerprint: calculateMasterNodeCertificateFingerprint(grpcMtlsConfig.certificate),
      sessionId: selfMasterNodeSessionId,

      endpoint: {
        hostname: env.PUBLIC_HOST,
        port: env.PUBLIC_PORT,
        scheme: 'grpcs'
      }
    }
  });

  const diskByteStorageConfig: DiskByteStorageConfig = {
    rootPath: env.BYTE_STORAGE_ROOT_PATH
  };

  const byteStorageModule = createByteStorageModule({
    prisma,
    diskByteStorageConfig,
    byteStorageConfig
  });

  const taskModule = createTaskModule({
    prisma,
    taskConfig,
    selfMasterNodeId,
    consensusService: consensusModule.service,
    byteStorageService: byteStorageModule.service
  });

  const userModule = createUserModule({
    prisma,
    taskService: taskModule.service,
    apiKeyHashKey: Buffer.from(env.USER_API_KEY_HASH_SECRET, 'utf8'),
    refreshTokenHashKey: Buffer.from(env.USER_REFRESH_TOKEN_HASH_SECRET, 'utf8')
  });

  const grpcClientCredentials = new MtlsGrpcClientCredentials(grpcMtlsConfig);
  const grpcServerCredentials = new MtlsGrpcServerCredentials(grpcMtlsConfig);

  const bucketModule = createBucketModule({
    prisma,
    taskService: taskModule.service
  });

  const dataNodeModule = createDataNodeModule({
    prisma,
    taskService: taskModule.service,
    grpcClientCredentials
  });

  const blobModule = createBlobModule({
    blobConfig,
    taskService: taskModule.service,
    grpcClientCredentials,
    grpcConfig: blobGrpcConfig
  });

  const objectVersionPartModule = createObjectVersionPartModule({
    prisma,
    blobConfig,
    partConfig,
    dataNodeService: dataNodeModule.service,
    blobService: blobModule.service,
    blobGrpcClient: blobModule.grpcClient
  });

  const objectModule = createObjectModule({
    prisma,
    taskService: taskModule.service,
    bucketService: bucketModule.service,
    objectVersionPartRepository: objectVersionPartModule.repository,
    objectVersionPartService: objectVersionPartModule.service,
    objectVersionPartTaskHandler: objectVersionPartModule.taskHandler
  });

  const backgroundModule = createBackgroundModule({
    taskApplyHandler: taskModule.applyHandler,
    taskLifecycleHandler: taskModule.lifecycleHandler,
    byteStorageLifecycleHandler: byteStorageModule.lifecycleHandler,
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
    identityModule,
    masterNodeModule,
    consensusModule,
    bootstrapModule,
    byteStorageModule,
    taskModule,
    userModule,
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
