import { GenericInternalServerError, GenericNotFoundError } from '@/errors/application.errors';
import { InternodeApplicationError } from '@/errors/internode.errors';

import type { DataNodeBlobInput } from '@/modules/blobs/blob.application';
import type { BlobId, BlobMetadataWithBytes } from '@/modules/blobs/blob.domain';
import type { BlobServiceContract } from '@/modules/blobs/blob.service';
import type { DataNode } from '@/modules/data-nodes/data-node.domain';
import { mapDataNodeToDataNodeEndpoint } from '@/modules/data-nodes/data-node.mappers';
import type { DataNodeServiceContract } from '@/modules/data-nodes/data-node.service';

import type {
  GetReplicaBlobResult,
  ListPartsByObjectVersionInput,
  UpdatePartReplicaStatesRepositoryInput
} from './object-version-part.application';
import type { Part, PartReplica } from './object-version-part.domain';
import { type GetPartBlobError, resolveFailedGetPartBlobError } from './object-version-part.error-resolvers';
import { resolveFailedGetPartReplicaState } from './object-version-part.replica-state-resolvers';
import type { ObjectVersionPartRepositoryContract } from './object-version-part.repository';
import { verifyPartBlob } from './object-version-part.verifiers';

/* contract */

type ObjectVersionPartServiceContract = {
  listPartsByObjectVersion(input: ListPartsByObjectVersionInput): Promise<Part[]>;
  getPartBlob(blobId: BlobId): Promise<BlobMetadataWithBytes>;
};

/* service */

class ObjectVersionPartService implements ObjectVersionPartServiceContract {
  constructor(
    private readonly repository: ObjectVersionPartRepositoryContract,
    private readonly dataNodeService: DataNodeServiceContract,
    private readonly blobService: BlobServiceContract
  ) {}

  /* public */

  async listPartsByObjectVersion(input: ListPartsByObjectVersionInput): Promise<Part[]> {
    const parts = await this.repository.listPartsByObjectVersion(input.objectId, input.version);

    return parts;
  }

  async getPartBlob(blobId: BlobId): Promise<BlobMetadataWithBytes> {
    const part = await this.repository.findPartByBlobId(blobId);

    if (!part) {
      throw new GenericNotFoundError('Object version part not found');
    }

    const committedPartReplicas = await this.repository.listCommittedPartReplicasByBlobId(blobId);

    if (committedPartReplicas.length === 0) {
      throw new GenericInternalServerError('No committed replicas available for object version part');
    }

    return this.getPartBlobFromReplicas(part, committedPartReplicas);
  }

  /* private */

  /* get helpers */

  private async getPartBlobFromReplicas(part: Part, replicas: readonly PartReplica[]): Promise<BlobMetadataWithBytes> {
    const errors: GetPartBlobError[] = [];

    for (const replica of replicas) {
      let dataNode: DataNode;

      try {
        dataNode = await this.dataNodeService.getDataNodeById(replica.dataNodeId);
      } catch (err) {
        errors.push({
          source: 'data-node-resolution',
          error: err
        });
        continue;
      }

      const getReplicaBlobResult = await this.getReplicaBlob(part, dataNode);

      if (getReplicaBlobResult.status === 'fulfilled') {
        return getReplicaBlobResult.blob;
      }

      errors.push({
        source: 'replica-read',
        error: getReplicaBlobResult.reason
      });

      try {
        await this.updateReplicaStateFromGetReplicaBlobResult(part.blobId, getReplicaBlobResult);
      } catch (err) {
        errors.push({
          source: 'replica-state-update',
          error: err
        });
      }
    }

    throw resolveFailedGetPartBlobError(errors);
  }

  private async getReplicaBlob(part: Part, dataNode: DataNode): Promise<GetReplicaBlobResult> {
    try {
      const getBlobInput: DataNodeBlobInput = {
        blobId: part.blobId,

        dataNodeEndpoint: mapDataNodeToDataNodeEndpoint(dataNode)
      };

      const blob = await this.blobService.getBlob(getBlobInput);

      verifyPartBlob(part, blob);

      return {
        dataNodeId: dataNode.id,
        status: 'fulfilled',
        blob
      };
    } catch (err) {
      if (!(err instanceof InternodeApplicationError)) {
        throw err;
      }

      return {
        dataNodeId: dataNode.id,
        status: 'rejected',
        reason: err
      };
    }
  }

  private async updateReplicaStateFromGetReplicaBlobResult(
    blobId: BlobId,
    getReplicaBlobResult: GetReplicaBlobResult
  ): Promise<void> {
    if (getReplicaBlobResult.status === 'fulfilled') {
      return;
    }

    const state = resolveFailedGetPartReplicaState(getReplicaBlobResult.reason);
    if (state === null) {
      return;
    }

    const updateStatesInput: UpdatePartReplicaStatesRepositoryInput = [
      {
        blobId,
        dataNodeId: getReplicaBlobResult.dataNodeId,

        expectedState: 'committed',
        state
      }
    ];

    await this.repository.updatePartReplicaStates(updateStatesInput);
  }
}

/* exports */

export { ObjectVersionPartService };
export type { ObjectVersionPartServiceContract };
