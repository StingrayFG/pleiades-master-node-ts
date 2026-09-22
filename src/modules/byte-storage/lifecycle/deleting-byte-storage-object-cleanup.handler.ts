import { GenericInternalServerError } from '@/errors/application.errors';
import { createAggregateErrorCause, type ErrorCauseEntry } from '@/errors/error-causes';

import type { ListDeletingCleanupCandidatesRepositoryInput } from '../byte-storage.application';
import type { ByteStorageConfig } from '../byte-storage.config';
import type { ByteStorageObject } from '../byte-storage.domain';
import { mapByteStorageObjectToByteStorageReference } from '../byte-storage.mappers';
import type { ByteStorageRepositoryContract } from '../byte-storage.repository';
import type { DiskByteStorageServiceContract } from '../disk-byte-storage.service';

/* handler */

class DeletingByteStorageObjectCleanupHandler {
  constructor(
    private readonly repository: ByteStorageRepositoryContract,
    private readonly diskService: DiskByteStorageServiceContract,
    private readonly byteStorageConfig: ByteStorageConfig
  ) {}

  async run(now: Date): Promise<void> {
    const updatedBefore = new Date(now.getTime() - this.byteStorageConfig.lifecycle.deletion.afterMs);

    const listCandidatesInput: ListDeletingCleanupCandidatesRepositoryInput = {
      updatedBefore,
      limit: this.byteStorageConfig.lifecycle.deletion.batchSize
    };

    const objects = await this.repository.listDeletingCleanupCandidates(listCandidatesInput);

    const results = await Promise.allSettled(objects.map((object) => this.cleanupObject(object)));

    const errors: ErrorCauseEntry[] = [];

    for (let index = 0; index < results.length; index += 1) {
      const result = results[index];

      if (result.status === 'rejected') {
        errors.push({
          source: objects[index].id,
          error: result.reason
        });
      }
    }

    if (errors.length > 0) {
      const cause = createAggregateErrorCause(errors);

      throw new GenericInternalServerError('Deleting byte storage object cleanup failed', { cause });
    }
  }

  private async cleanupObject(object: ByteStorageObject): Promise<void> {
    if (object.state !== 'deleting') {
      return;
    }

    // a failed delete leaves the row in deleting state, so the next sweep retries it
    await this.diskService.delete(mapByteStorageObjectToByteStorageReference(object));
    await this.repository.deleteByIdIfState(object.id, 'deleting');
  }
}

/* exports */

export { DeletingByteStorageObjectCleanupHandler };
