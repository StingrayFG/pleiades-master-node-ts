import { GenericInternalServerError } from '@/errors/application.errors';
import { InternodeAbortedError, InternodeAlreadyExistsError, InternodeNotFoundError } from '@/errors/internode.errors';
import type { TaskDefinitionHandler, TaskDefinitionResult, TaskDefinitionTask } from '@/modules/tasks/task.definition';

import type { DataNodeBlobWithBytesInput } from './blob.application';
import type { BlobConfig } from './blob.config';
import type { BlobMetadata } from './blob.domain';
import type { BlobGrpcClientContract } from './blob.grpc-client';
import type { deleteBlobTaskDefinition, ensureBlobExistsTaskDefinition } from './blob.tasks';
import { verifyBlobMetadataMatch, verifySuppliedBlobIntegrity } from './blob.verifiers';

/* contract */

type BlobTaskHandlerContract = {
  ensureBlobExists: TaskDefinitionHandler<typeof ensureBlobExistsTaskDefinition>;
  deleteBlob: TaskDefinitionHandler<typeof deleteBlobTaskDefinition>;
};

/* handler */

class BlobTaskHandler implements BlobTaskHandlerContract {
  constructor(
    private readonly grpcClient: BlobGrpcClientContract,
    private readonly blobConfig: BlobConfig
  ) {}

  async ensureBlobExists(
    task: TaskDefinitionTask<typeof ensureBlobExistsTaskDefinition>
  ): Promise<TaskDefinitionResult<typeof ensureBlobExistsTaskDefinition>> {
    verifySuppliedBlobIntegrity(task.data.blob, this.blobConfig.maxSizeBytes);

    try {
      const blob = await this.putBlobWithAttempts(task.data);

      verifyBlobMetadataMatch(task.data.blob, blob);

      return blob;
    } catch (err) {
      if (!(err instanceof InternodeAlreadyExistsError)) {
        throw err;
      }

      const existingBlob = await this.grpcClient.headBlob({
        blobId: task.data.blob.blobId,

        dataNodeEndpoint: task.data.dataNodeEndpoint
      });

      verifyBlobMetadataMatch(task.data.blob, existingBlob);

      return existingBlob;
    }
  }

  private async putBlobWithAttempts(input: DataNodeBlobWithBytesInput): Promise<BlobMetadata> {
    for (let attempt = 0; attempt < this.blobConfig.maxPutAttempts; attempt += 1) {
      try {
        return await this.grpcClient.putBlob(input);
      } catch (err) {
        if (!(err instanceof InternodeAbortedError)) {
          throw err;
        }
      }
    }

    throw new GenericInternalServerError('Failed to put blob on the data node after multiple attempts');
  }

  async deleteBlob(task: TaskDefinitionTask<typeof deleteBlobTaskDefinition>): Promise<void> {
    try {
      await this.grpcClient.deleteBlob(task.data);
    } catch (err) {
      if (!(err instanceof InternodeNotFoundError)) {
        throw err;
      }
    }
  }
}

/* exports */

export { BlobTaskHandler };
export type { BlobTaskHandlerContract };
