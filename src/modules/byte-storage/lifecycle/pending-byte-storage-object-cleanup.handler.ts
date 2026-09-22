import { GenericInternalServerError } from '@/errors/application.errors';
import { createAggregateErrorCause, type ErrorCauseEntry } from '@/errors/error-causes';

import type { ListPendingCleanupCandidatesRepositoryInput } from '../byte-storage.application';
import type { ByteStorageConfig } from '../byte-storage.config';
import type { ByteStorageObject } from '../byte-storage.domain';
import { mapByteStorageObjectToByteStorageReference } from '../byte-storage.mappers';
import type { ByteStorageRepositoryContract } from '../byte-storage.repository';
import type { DiskByteStorageServiceContract } from '../disk-byte-storage.service';

/* handler */

class PendingByteStorageObjectCleanupHandler {
  constructor(
    private readonly repository: ByteStorageRepositoryContract,
    private readonly diskService: DiskByteStorageServiceContract,
    private readonly byteStorageConfig: ByteStorageConfig
  ) {}

  async run(now: Date): Promise<void> {
    const updatedBefore = new Date(now.getTime() - this.byteStorageConfig.lifecycle.pendingCleanup.afterMs);

    const listCandidatesInput: ListPendingCleanupCandidatesRepositoryInput = {
      updatedBefore,
      limit: this.byteStorageConfig.lifecycle.pendingCleanup.batchSize
    };

    const objects = await this.repository.listPendingCleanupCandidates(listCandidatesInput);

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

      throw new GenericInternalServerError('Pending byte storage object cleanup failed', { cause });
    }
  }

  private async cleanupObject(object: ByteStorageObject): Promise<void> {
    if (object.state !== 'pending') {
      return;
    }

    // the row delete only lands if the object is still pending,
    // so a concurrent store completing its activation is never clobbered;
    // a failed delete leaves the row pending, so the next sweep retries it
    await this.diskService.delete(mapByteStorageObjectToByteStorageReference(object));
    await this.repository.deleteByIdIfState(object.id, 'pending');
  }
}

/* exports */

export { PendingByteStorageObjectCleanupHandler };
