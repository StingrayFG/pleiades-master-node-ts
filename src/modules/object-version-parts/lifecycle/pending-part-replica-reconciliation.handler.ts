import { GenericInternalServerError } from '@/errors/application.errors';
import { InternodeApplicationError } from '@/errors/internode.errors';

import type { BlobServiceContract } from '@/modules/blobs/blob.service';
import { mapDataNodeToDataNodeEndpoint } from '@/modules/data-nodes/data-node.mappers';
import type { DataNodeServiceContract } from '@/modules/data-nodes/data-node.service';

import type { PartConfig } from '../object-version-part.config';
import type { PartReplica, PartReplicaState } from '../object-version-part.domain';
import { resolveFailedGetPartReplicaState } from '../object-version-part.replica-state-resolvers';
import type { ObjectVersionPartRepositoryContract } from '../object-version-part.repository';
import { verifyPartBlob } from '../object-version-part.verifiers';

/* handler */

class PendingPartReplicaReconciliationHandler {
  constructor(
    private readonly repository: ObjectVersionPartRepositoryContract,
    private readonly dataNodeService: DataNodeServiceContract,
    private readonly blobService: BlobServiceContract,
    private readonly partConfig: PartConfig
  ) {}

  async run(now: Date): Promise<void> {
    const updatedBefore = new Date(now.getTime() - this.partConfig.lifecycle.reconciliation.afterMs);

    const pendingExpiredBefore = new Date(now.getTime() - this.partConfig.lifecycle.reconciliation.maxAgeMs);

    const partReplicas = await this.repository.listPendingPartReplicaReconciliationCandidates({
      updatedBefore,
      limit: this.partConfig.lifecycle.reconciliation.batchSize
    });

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
      await this.repository.applyPendingPartReplicaReconciliation({
        blobId: partReplica.blobId,
        dataNodeId: partReplica.dataNodeId,

        state: pendingExpired ? 'missing' : 'pending'
      });

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

    await this.repository.applyPendingPartReplicaReconciliation({
      blobId: partReplica.blobId,
      dataNodeId: partReplica.dataNodeId,

      state,

      ...(verifiedAt !== undefined
        ? {
            verifiedAt
          }
        : {})
    });
  }
}

/* exports */

export { PendingPartReplicaReconciliationHandler };
