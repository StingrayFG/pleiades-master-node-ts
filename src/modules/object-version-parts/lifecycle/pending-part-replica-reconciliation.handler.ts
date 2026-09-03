import { GenericInternalServerError } from '@/errors/application.errors';
import { InternodeApplicationError } from '@/errors/internode.errors';

import type { BlobServiceContract } from '@/modules/blobs/blob.service';
import { mapDataNodeToDataNodeEndpoint } from '@/modules/data-nodes/data-node.mappers';
import type { DataNodeServiceContract } from '@/modules/data-nodes/data-node.service';

import type {
  ApplyPendingPartReplicaReconciliationRepositoryInput,
  ListPendingPartReplicaReconciliationCandidatesRepositoryInput
} from '../object-version-part.application';
import type { PartReplica, PartReplicaState } from '../object-version-part.domain';
import { resolveFailedGetPartReplicaState } from '../object-version-part.replica-state-resolvers';
import type { ObjectVersionPartRepositoryContract } from '../object-version-part.repository';
import { verifyPartBlob } from '../object-version-part.verifiers';

/* constants */

const PART_REPLICA_PENDING_RECONCILIATION_AFTER_MS = 10 * 60 * 1000;
const PART_REPLICA_PENDING_MAX_AGE_MS = 60 * 60 * 1000;
const PART_REPLICA_PENDING_RECONCILIATION_BATCH_SIZE = 32;

/* handler */

class PendingPartReplicaReconciliationHandler {
  constructor(
    private readonly repository: ObjectVersionPartRepositoryContract,
    private readonly dataNodeService: DataNodeServiceContract,
    private readonly blobService: BlobServiceContract
  ) {}

  async run(now: Date): Promise<void> {
    const updatedBefore = new Date(now.getTime() - PART_REPLICA_PENDING_RECONCILIATION_AFTER_MS);

    const pendingExpiredBefore = new Date(now.getTime() - PART_REPLICA_PENDING_MAX_AGE_MS);

    const listPendingCandidatesInput: ListPendingPartReplicaReconciliationCandidatesRepositoryInput = {
      updatedBefore,
      limit: PART_REPLICA_PENDING_RECONCILIATION_BATCH_SIZE
    };

    const partReplicas =
      await this.repository.listPendingPartReplicaReconciliationCandidates(listPendingCandidatesInput);

    await Promise.all(
      partReplicas.map((partReplica) => this.reconcilePendingPartReplica(partReplica, now, pendingExpiredBefore))
    );
  }

  private async reconcilePendingPartReplica(
    partReplica: PartReplica,
    reconciledAt: Date,
    pendingExpiredBefore: Date
  ): Promise<void> {
    const part = await this.repository.findPartByBlobId(partReplica.blobId);

    if (!part) {
      throw new GenericInternalServerError('Part replica references a missing object version part');
    }

    const pendingExpired = partReplica.stateChangedAt <= pendingExpiredBefore;

    const dataNode = await this.dataNodeService.getDataNodeById(partReplica.dataNodeId);

    if (dataNode.state !== 'active') {
      const reconciliationInput: ApplyPendingPartReplicaReconciliationRepositoryInput = {
        blobId: partReplica.blobId,
        dataNodeId: partReplica.dataNodeId,

        state: pendingExpired ? 'missing' : 'pending'
      };

      await this.repository.applyPendingPartReplicaReconciliation(reconciliationInput);

      return;
    }

    let state: PartReplicaState = 'pending';
    let verifiedAt: Date | undefined;

    try {
      const blobMetadata = await this.blobService.getBlobMetadata({
        blobId: part.blobId,
        dataNodeEndpoint: mapDataNodeToDataNodeEndpoint(dataNode)
      });

      verifyPartBlob(part, blobMetadata);

      state = 'committed';
      verifiedAt = reconciledAt;
    } catch (err) {
      if (!(err instanceof InternodeApplicationError)) {
        throw err;
      }

      const failedState = resolveFailedGetPartReplicaState(err);

      if (failedState !== null) {
        state = failedState;
      }
    }

    if (state === 'pending' && pendingExpired) {
      state = 'missing';
    }

    const reconciliationInput: ApplyPendingPartReplicaReconciliationRepositoryInput = {
      blobId: partReplica.blobId,
      dataNodeId: partReplica.dataNodeId,

      state,

      ...(verifiedAt !== undefined
        ? {
            verifiedAt
          }
        : {})
    };

    await this.repository.applyPendingPartReplicaReconciliation(reconciliationInput);
  }
}

/* exports */

export { PendingPartReplicaReconciliationHandler };
