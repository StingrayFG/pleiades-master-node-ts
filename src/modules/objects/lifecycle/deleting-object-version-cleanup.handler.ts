import type { ObjectVersionPartRepositoryContract } from '@/modules/object-version-parts/object-version-part.repository';

import { objectConfig } from '../object.config';
import type { ObjectVersion } from '../object.domain';
import type { ObjectRepositoryContract } from '../object.repository';

/* handler */

class DeletingObjectVersionCleanupHandler {
  constructor(
    private readonly objectRepository: ObjectRepositoryContract,
    private readonly objectVersionPartRepository: ObjectVersionPartRepositoryContract
  ) {}

  async run(): Promise<void> {
    const objectVersions = await this.objectRepository.listDeletingObjectVersionCleanupCandidates({
      limit: objectConfig.lifecycle.deletionCleanupBatchSize
    });

    await Promise.all(objectVersions.map((objectVersion) => this.cleanupDeletingObjectVersion(objectVersion)));
  }

  private async cleanupDeletingObjectVersion(objectVersion: ObjectVersion): Promise<void> {
    if (objectVersion.state !== 'deleting') {
      return;
    }

    await this.objectVersionPartRepository.applyObjectVersionDeletionToPartReplicas({
      objectId: objectVersion.objectId,
      version: objectVersion.version
    });

    await this.objectVersionPartRepository.deleteReplicaFreePartsByObjectVersion({
      objectId: objectVersion.objectId,
      version: objectVersion.version
    });

    const objectVersionDeleted = await this.objectRepository.deleteObjectVersionIfDeletingAndPartsGone({
      objectId: objectVersion.objectId,
      version: objectVersion.version
    });

    if (objectVersionDeleted) {
      return;
    }

    await this.objectRepository.touchObjectVersionDeletionCandidate({
      objectId: objectVersion.objectId,
      version: objectVersion.version
    });
  }
}

/* exports */

export { DeletingObjectVersionCleanupHandler };
