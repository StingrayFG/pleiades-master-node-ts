import { InternodeApplicationError, InternodeNotFoundError } from '@/errors/internode.errors';

import type { BlobServiceContract } from '@/modules/blobs/blob.service';
import { mapDataNodeToDataNodeEndpoint } from '@/modules/data-nodes/data-node.mappers';
import type { DataNodeServiceContract } from '@/modules/data-nodes/data-node.service';

import type {
  DeletePartReplicaIfDeletingRepositoryInput,
  ListPartReplicaDeletionCandidatesRepositoryInput,
  TouchPartReplicaDeletionCandidateRepositoryInput
} from '../object-version-part.application';
import type { PartReplica } from '../object-version-part.domain';
import type { ObjectVersionPartRepositoryContract } from '../object-version-part.repository';

/* constants */

const PART_REPLICA_DELETION_AFTER_MS = 10 * 60 * 1000;
const PART_REPLICA_DELETION_BATCH_SIZE = 32;

/* handler */

class PartReplicaDeletionHandler {
  constructor(
    private readonly repository: ObjectVersionPartRepositoryContract,
    private readonly dataNodeService: DataNodeServiceContract,
    private readonly blobService: BlobServiceContract
  ) {}

  async run(now: Date): Promise<void> {
    const updatedBefore = new Date(now.getTime() - PART_REPLICA_DELETION_AFTER_MS);

    const listDeletionCandidatesInput: ListPartReplicaDeletionCandidatesRepositoryInput = {
      updatedBefore,
      limit: PART_REPLICA_DELETION_BATCH_SIZE
    };

    const partReplicas = await this.repository.listPartReplicaDeletionCandidates(listDeletionCandidatesInput);

    await Promise.all(partReplicas.map((partReplica) => this.deletePartReplica(partReplica)));
  }

  private async deletePartReplica(partReplica: PartReplica): Promise<void> {
    if (partReplica.state !== 'deleting') {
      return;
    }

    const dataNode = await this.dataNodeService.getDataNodeById(partReplica.dataNodeId);

    if (dataNode.state !== 'active') {
      await this.touchDeletionCandidate(partReplica);
      return;
    }

    try {
      await this.blobService.deleteBlob({
        blobId: partReplica.blobId,
        dataNodeEndpoint: mapDataNodeToDataNodeEndpoint(dataNode)
      });
    } catch (err) {
      if (!(err instanceof InternodeApplicationError)) {
        throw err;
      }

      if (!(err instanceof InternodeNotFoundError)) {
        await this.touchDeletionCandidate(partReplica);
        return;
      }
    }

    const deleteReplicaInput: DeletePartReplicaIfDeletingRepositoryInput = {
      blobId: partReplica.blobId,
      dataNodeId: partReplica.dataNodeId
    };

    await this.repository.deletePartReplicaIfDeleting(deleteReplicaInput);
  }

  private async touchDeletionCandidate(partReplica: PartReplica): Promise<void> {
    const touchDeletionCandidateInput: TouchPartReplicaDeletionCandidateRepositoryInput = {
      blobId: partReplica.blobId,
      dataNodeId: partReplica.dataNodeId
    };

    await this.repository.touchPartReplicaDeletionCandidate(touchDeletionCandidateInput);
  }
}

/* exports */

export { PartReplicaDeletionHandler };
