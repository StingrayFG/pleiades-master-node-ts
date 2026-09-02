import type {
  ApplyObjectVersionDeletionToPartReplicasRepositoryInput,
  DeleteReplicaFreePartsByObjectVersionRepositoryInput
} from '@/modules/object-version-parts/object-version-part.application';
import type { ObjectVersionPartRepositoryContract } from '@/modules/object-version-parts/object-version-part.repository';

import type {
  DeleteObjectVersionIfDeletingAndPartsGoneRepositoryInput,
  ListDeletingObjectVersionCleanupCandidatesRepositoryInput,
  TouchObjectVersionDeletionCandidateRepositoryInput
} from '../object.application';
import type { ObjectVersion } from '../object.domain';
import type { ObjectRepositoryContract } from '../object.repository';

/* constants */

const OBJECT_VERSION_DELETION_BATCH_SIZE = 32;

/* handler */

class DeletingObjectVersionCleanupHandler {
  constructor(
    private readonly objectRepository: ObjectRepositoryContract,
    private readonly objectVersionPartRepository: ObjectVersionPartRepositoryContract
  ) {}

  async run(): Promise<void> {
    const listDeletionCandidatesInput: ListDeletingObjectVersionCleanupCandidatesRepositoryInput = {
      limit: OBJECT_VERSION_DELETION_BATCH_SIZE
    };

    const objectVersions =
      await this.objectRepository.listDeletingObjectVersionCleanupCandidates(listDeletionCandidatesInput);

    await Promise.all(objectVersions.map((objectVersion) => this.cleanupDeletingObjectVersion(objectVersion)));
  }

  private async cleanupDeletingObjectVersion(objectVersion: ObjectVersion): Promise<void> {
    if (objectVersion.state !== 'deleting') {
      return;
    }

    const applyReplicaDeletionInput: ApplyObjectVersionDeletionToPartReplicasRepositoryInput = {
      objectId: objectVersion.objectId,
      version: objectVersion.version
    };

    await this.objectVersionPartRepository.applyObjectVersionDeletionToPartReplicas(applyReplicaDeletionInput);

    const deleteReplicaFreePartsInput: DeleteReplicaFreePartsByObjectVersionRepositoryInput = {
      objectId: objectVersion.objectId,
      version: objectVersion.version
    };

    await this.objectVersionPartRepository.deleteReplicaFreePartsByObjectVersion(deleteReplicaFreePartsInput);

    const deleteObjectVersionInput: DeleteObjectVersionIfDeletingAndPartsGoneRepositoryInput = {
      objectId: objectVersion.objectId,
      version: objectVersion.version
    };

    const objectVersionDeleted =
      await this.objectRepository.deleteObjectVersionIfDeletingAndPartsGone(deleteObjectVersionInput);

    if (objectVersionDeleted) {
      return;
    }

    const touchDeletionCandidateInput: TouchObjectVersionDeletionCandidateRepositoryInput = {
      objectId: objectVersion.objectId,
      version: objectVersion.version
    };

    await this.objectRepository.touchObjectVersionDeletionCandidate(touchDeletionCandidateInput);
  }
}

/* exports */

export { DeletingObjectVersionCleanupHandler };
