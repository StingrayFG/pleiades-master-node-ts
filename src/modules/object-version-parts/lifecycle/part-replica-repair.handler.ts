import { GenericInternalServerError } from '@/errors/application.errors';
import { createAggregateErrorCause, type ErrorCauseEntry } from '@/errors/error.causes';
import { InternodeApplicationError } from '@/errors/internode.errors';

import type { BlobMetadataWithBytes } from '@/modules/blobs/blob.domain';
import type { BlobServiceContract } from '@/modules/blobs/blob.service';
import type { DataNode } from '@/modules/data-nodes/data-node.domain';
import { mapDataNodeToDataNodeEndpoint } from '@/modules/data-nodes/data-node.mappers';
import type { DataNodeServiceContract } from '@/modules/data-nodes/data-node.service';

import type { PartConfig } from '../object-version-part.config';
import type { Part, PartReplica, PartReplicaState } from '../object-version-part.domain';
import { selectResponsibleDataNodes } from '../object-version-part.policies';
import {
  resolveFailedCreatePartReplicaState,
  resolveFailedGetPartReplicaState
} from '../object-version-part.replica-state-resolvers';
import type { ObjectVersionPartRepositoryContract } from '../object-version-part.repository';
import { verifyPartBlob } from '../object-version-part.verifiers';

/* handler */

class PartReplicaRepairHandler {
  constructor(
    private readonly repository: ObjectVersionPartRepositoryContract,
    private readonly dataNodeService: DataNodeServiceContract,
    private readonly blobService: BlobServiceContract,
    private readonly partConfig: PartConfig
  ) {}

  async run(now: Date): Promise<void> {
    const updatedBefore = new Date(now.getTime() - this.partConfig.lifecycle.repair.afterMs);

    const partReplicas = await this.repository.listPartReplicaRepairCandidates({
      updatedBefore,
      limit: this.partConfig.lifecycle.repair.batchSize
    });

    const errors: ErrorCauseEntry[] = [];

    for (let index = 0; index < partReplicas.length; index += this.partConfig.lifecycle.repair.concurrency) {
      const repairBatch = partReplicas.slice(index, index + this.partConfig.lifecycle.repair.concurrency);

      const results = await Promise.allSettled(
        repairBatch.map((partReplica) => this.repairFailedPartReplica(partReplica, now))
      );

      for (let resultIndex = 0; resultIndex < results.length; resultIndex += 1) {
        const result = results[resultIndex];

        if (result.status === 'rejected') {
          const partReplica = repairBatch[resultIndex];

          errors.push({
            source: `${partReplica.blobId}:${partReplica.dataNodeId}`,
            error: result.reason
          });
        }
      }
    }

    if (errors.length > 0) {
      const cause = createAggregateErrorCause(errors);

      throw new GenericInternalServerError('Failed to repair one or more object version part replicas', {
        cause
      });
    }
  }

  private async repairFailedPartReplica(partReplica: PartReplica, repairedAt: Date): Promise<void> {
    if (partReplica.state !== 'missing' && partReplica.state !== 'corrupt') {
      return;
    }

    const part = await this.repository.findPartByBlobId(partReplica.blobId);

    if (!part) {
      throw new GenericInternalServerError('Part replica references a missing object version part');
    }

    const partReplicas = await this.repository.listPartReplicasByBlobId(part.blobId);

    const effectiveReplicaCount = partReplicas.filter(
      (replica) => replica.state === 'committed' || replica.state === 'pending'
    ).length;

    if (effectiveReplicaCount >= this.partConfig.replicationFactor) {
      await this.markRepairCandidateDeleting(partReplica);
      return;
    }

    const replacementDataNode = await this.findReplacementDataNode(part, partReplicas);

    if (!replacementDataNode) {
      await this.touchRepairCandidate(partReplica);
      return;
    }

    const blob = await this.findRepairSourceBlob(part, repairedAt);

    if (!blob) {
      await this.touchRepairCandidate(partReplica);
      return;
    }

    const claimRepairResult = await this.repository.claimPartReplicaRepair({
      blobId: partReplica.blobId,
      failedDataNodeId: partReplica.dataNodeId,
      replacementDataNodeId: replacementDataNode.id,

      expectedState: partReplica.state
    });

    if (!claimRepairResult) {
      return;
    }

    let state: PartReplicaState;
    let verifiedAt: Date | undefined;

    try {
      await this.blobService.ensureBlobExists({
        blob,

        dataNodeEndpoint: mapDataNodeToDataNodeEndpoint(replacementDataNode)
      });

      state = 'committed';
      verifiedAt = repairedAt;
    } catch (err) {
      if (!(err instanceof InternodeApplicationError)) {
        throw err;
      }

      state = resolveFailedCreatePartReplicaState(err);

      if (state === 'pending') {
        return;
      }
    }

    await this.repository.applyPartReplicaRepair({
      blobId: partReplica.blobId,
      dataNodeId: replacementDataNode.id,

      state,

      ...(verifiedAt !== undefined
        ? {
            verifiedAt
          }
        : {})
    });
  }

  private async findReplacementDataNode(part: Part, partReplicas: readonly PartReplica[]): Promise<DataNode | null> {
    const availableDataNodes = await this.dataNodeService.listAvailableDataNodes();

    const existingDataNodeIds = new Set(partReplicas.map((partReplica) => partReplica.dataNodeId));

    const candidateDataNodes = availableDataNodes.filter(
      (dataNode) => !existingDataNodeIds.has(dataNode.id) && dataNode.storageFreeBytes >= part.sizeBytes
    );

    const [replacementDataNode] = selectResponsibleDataNodes(part.placementGroup, 1, candidateDataNodes);

    return replacementDataNode ?? null;
  }

  private async findRepairSourceBlob(part: Part, verifiedAt: Date): Promise<BlobMetadataWithBytes | null> {
    const committedPartReplicas = await this.repository.listCommittedPartReplicasByBlobId(part.blobId);

    for (const partReplica of committedPartReplicas) {
      const dataNode = await this.dataNodeService.getDataNodeById(partReplica.dataNodeId);

      if (dataNode.state !== 'active') {
        continue;
      }

      try {
        const blob = await this.blobService.getBlob({
          blobId: part.blobId,

          dataNodeEndpoint: mapDataNodeToDataNodeEndpoint(dataNode)
        });

        verifyPartBlob(part, blob);

        await this.repository.applyPartReplicaVerification({
          blobId: partReplica.blobId,
          dataNodeId: partReplica.dataNodeId,

          state: 'committed',
          verifiedAt
        });

        return blob;
      } catch (err) {
        if (!(err instanceof InternodeApplicationError)) {
          throw err;
        }

        const failedState = resolveFailedGetPartReplicaState(err);

        if (failedState === null) {
          continue;
        }

        await this.repository.applyPartReplicaVerification({
          blobId: partReplica.blobId,
          dataNodeId: partReplica.dataNodeId,

          state: failedState
        });
      }
    }

    return null;
  }

  private async markRepairCandidateDeleting(partReplica: PartReplica): Promise<void> {
    if (partReplica.state !== 'missing' && partReplica.state !== 'corrupt') {
      return;
    }

    await this.repository.applyRedundantPartReplicaDeletion({
      blobId: partReplica.blobId,
      dataNodeId: partReplica.dataNodeId,

      expectedState: partReplica.state
    });
  }

  private async touchRepairCandidate(partReplica: PartReplica): Promise<void> {
    if (partReplica.state !== 'missing' && partReplica.state !== 'corrupt') {
      return;
    }

    await this.repository.touchPartReplicaRepairCandidate({
      blobId: partReplica.blobId,
      dataNodeId: partReplica.dataNodeId,

      state: partReplica.state
    });
  }
}

/* exports */

export { PartReplicaRepairHandler };
