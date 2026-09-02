import { objectConfig } from '../object.config';
import type { ObjectRepositoryContract } from '../object.repository';

/* handler */

class PendingObjectVersionCleanupHandler {
  constructor(private readonly repository: ObjectRepositoryContract) {}

  async run(now: Date): Promise<void> {
    const updatedBefore = new Date(now.getTime() - objectConfig.lifecycle.pendingCleanupAfterMs);

    const candidates = await this.repository.listPendingObjectVersionCleanupCandidates({
      updatedBefore,
      limit: objectConfig.lifecycle.pendingCleanupBatchSize
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
