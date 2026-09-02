import type { ObjectRepositoryContract } from '../object.repository';

/* constants */

const OBJECT_VERSION_PENDING_CLEANUP_AFTER_MS = 60 * 60 * 1000;
const OBJECT_VERSION_PENDING_CLEANUP_BATCH_SIZE = 32;

/* handler */

class PendingObjectVersionCleanupHandler {
  constructor(private readonly repository: ObjectRepositoryContract) {}

  async run(now: Date): Promise<void> {
    const updatedBefore = new Date(now.getTime() - OBJECT_VERSION_PENDING_CLEANUP_AFTER_MS);

    const candidates = await this.repository.listPendingObjectVersionCleanupCandidates({
      updatedBefore,
      limit: OBJECT_VERSION_PENDING_CLEANUP_BATCH_SIZE
    });

    await Promise.all(
      candidates.map((objectVersion) =>
        this.repository.claimObjectVersionCleanup({
          objectId: objectVersion.objectId,
          version: objectVersion.version,
          updatedBefore
        })
      )
    );
  }
}

/* exports */

export { PendingObjectVersionCleanupHandler };
