import { GenericInternalServerError } from '@/errors/application.errors';
import { createAggregateErrorCause, type ErrorCauseEntry } from '@/errors/error.causes';

import { DeletingByteStorageObjectCleanupHandler } from './deleting-byte-storage-object-cleanup.handler';
import { OrphanedTemporaryFileCleanupHandler } from './orphaned-temporary-file-cleanup.handler';
import { PendingByteStorageObjectCleanupHandler } from './pending-byte-storage-object-cleanup.handler';

/* contract */

type ByteStorageLifecycleHandlerContract = {
  run(): Promise<void>;
};

/* handler */

class ByteStorageLifecycleHandler implements ByteStorageLifecycleHandlerContract {
  constructor(
    private readonly pendingByteStorageObjectCleanupHandler: PendingByteStorageObjectCleanupHandler,
    private readonly deletingByteStorageObjectCleanupHandler: DeletingByteStorageObjectCleanupHandler,
    private readonly orphanedTemporaryFileCleanupHandler: OrphanedTemporaryFileCleanupHandler
  ) {}

  async run(): Promise<void> {
    const now = new Date();

    const results = await Promise.allSettled([
      this.pendingByteStorageObjectCleanupHandler.run(now),
      this.deletingByteStorageObjectCleanupHandler.run(now),
      this.orphanedTemporaryFileCleanupHandler.run(now)
    ]);

    const errors: ErrorCauseEntry[] = [];

    const sources = ['pendingCleanup', 'deletion', 'temporaryFileCleanup'] as const;

    for (let index = 0; index < results.length; index += 1) {
      const result = results[index];

      if (result.status === 'rejected') {
        errors.push({
          source: sources[index],
          error: result.reason
        });
      }
    }

    if (errors.length > 0) {
      const cause = createAggregateErrorCause(errors);

      throw new GenericInternalServerError('Byte storage lifecycle execution failed', { cause });
    }
  }
}

/* exports */

export { ByteStorageLifecycleHandler };
export type { ByteStorageLifecycleHandlerContract };
