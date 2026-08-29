import { randomUUID } from 'node:crypto';

import env from '@/env';
import {
  GenericBadRequestError,
  GenericConflictError,
  GenericInternalServerError,
  GenericNotFoundError
} from '@/errors/application.errors';
import { InternodeApplicationError } from '@/errors/internode.errors';

import { BLOB_CHECKSUM_ALGORITHM, type BlobId, type BlobMetadataWithBytes } from '@/modules/blobs/blob.domain';
import { calculateBlobChecksum } from '@/modules/blobs/blob.processors';
import type { BlobServiceContract } from '@/modules/blobs/blob.service';
import type { DataNode, DataNodeId } from '@/modules/data-nodes/data-node.domain';
import { mapDataNodeToDataNodeEndpoint } from '@/modules/data-nodes/data-node.mappers';
import type { DataNodeServiceContract } from '@/modules/data-nodes/data-node.service';

import type {
  CreatePartInput,
  CreateReplicaBlobResult,
  CreatePartResult,
  CreatePartsInput,
  GetReplicaBlobResult,
  ListPartsByObjectVersionInput,
  UpdateReplicaStatesRepositoryInput
} from './object-version-part.application';
import type { Part, PartReplica } from './object-version-part.domain';
import { calculatePartPlacementGroup, selectResponsibleDataNodes } from './object-version-part.domain-policies';
import { splitObjectDataIntoPartBytes } from './object-version-part.processors';
import {
  resolveFailedCreatePartReplicaState,
  resolveFailedGetPartReplicaState
} from './object-version-part.replica-state-resolvers';
import type { ObjectVersionPartRepositoryContract } from './object-version-part.repository';
import { verifyPartBlob } from './object-version-part.verifiers';

/* contract */

type ObjectVersionPartServiceContract = {
  listPartsByObjectVersion(input: ListPartsByObjectVersionInput): Promise<Part[]>;
  getPartBlob(blobId: BlobId): Promise<BlobMetadataWithBytes>;
  createPartsFromData(input: CreatePartsInput): Promise<Part[]>;
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

  async createPartsFromData(input: CreatePartsInput): Promise<Part[]> {
    const parts: Part[] = [];

    const activeDataNodes = await this.dataNodeService.listActiveDataNodes();

    const remainingStorageByDataNodeId = new Map<DataNodeId, bigint>(
      activeDataNodes.map((dataNode) => [dataNode.id, dataNode.storageFreeBytes])
    );

    let receivedSizeBytes = 0n;
    let partNumber = 1;

    for await (const partBytes of splitObjectDataIntoPartBytes(input.data, env.BLOB_SIZE_LIMIT_BYTES)) {
      const sizeBytes = BigInt(partBytes.length);
      receivedSizeBytes += sizeBytes;
      if (receivedSizeBytes > input.totalSizeBytes) {
        throw new GenericBadRequestError('Content-Length does not match object data size');
      }

      const availableDataNodes = activeDataNodes.map((dataNode) => ({
        ...dataNode,
        storageFreeBytes: remainingStorageByDataNodeId.get(dataNode.id) ?? dataNode.storageFreeBytes
      }));

      const result = await this.createPart({
        part: {
          objectId: input.objectId,
          version: input.version,
          partNumber,
          bytes: partBytes
        },
        availableDataNodes
      });

      for (const dataNode of result.responsibleDataNodes) {
        const remainingStorage = remainingStorageByDataNodeId.get(dataNode.id);

        if (remainingStorage !== undefined) {
          remainingStorageByDataNodeId.set(dataNode.id, remainingStorage - sizeBytes);
        }
      }

      parts.push(result.part);

      partNumber += 1;
    }

    if (receivedSizeBytes !== input.totalSizeBytes) {
      throw new GenericBadRequestError('Content-Length does not match object data size');
    }

    return parts;
  }

  /* private */

  /* get helpers */

  private async getPartBlobFromReplicas(part: Part, replicas: readonly PartReplica[]): Promise<BlobMetadataWithBytes> {
    const errors: unknown[] = [];

    for (const replica of replicas) {
      let dataNode: DataNode;

      try {
        dataNode = await this.dataNodeService.getDataNodeById(replica.dataNodeId);
      } catch (err) {
        errors.push(err);
        continue;
      }

      const getReplicaBlobResult = await this.getReplicaBlob(part, dataNode);

      if (getReplicaBlobResult.status === 'fulfilled') {
        return getReplicaBlobResult.blob;
      }

      errors.push(getReplicaBlobResult.reason);

      try {
        await this.updateReplicaStateFromGetReplicaBlobResult(part.blobId, getReplicaBlobResult);
      } catch (err) {
        errors.push(err);
      }
    }

    throw new GenericInternalServerError('Failed to read object version part from all committed replicas', {
      cause: new AggregateError(errors)
    });
  }

  private async getReplicaBlob(part: Part, dataNode: DataNode): Promise<GetReplicaBlobResult> {
    try {
      const blob = await this.blobService.getBlob({
        blobId: part.blobId,
        dataNodeEndpoint: mapDataNodeToDataNodeEndpoint(dataNode)
      });

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
    result: GetReplicaBlobResult
  ): Promise<void> {
    if (result.status === 'fulfilled') {
      return;
    }

    const state = resolveFailedGetPartReplicaState(result.reason);
    if (state === null) {
      return;
    }

    await this.repository.updatePartReplicaStates([
      {
        blobId,
        dataNodeId: result.dataNodeId,
        state
      }
    ]);
  }

  /* create helpers */

  private async createPart(input: CreatePartInput): Promise<CreatePartResult> {
    const partInput = input.part;

    const blobId = randomUUID();
    const placementGroup = calculatePartPlacementGroup(blobId, env.PLACEMENT_GROUP_COUNT);
    const sizeBytes = BigInt(partInput.bytes.length);
    const checksumValue = calculateBlobChecksum(partInput.bytes);

    const candidateDataNodes = input.availableDataNodes.filter((dataNode) => dataNode.storageFreeBytes >= sizeBytes);
    if (candidateDataNodes.length < env.REPLICATION_FACTOR) {
      throw new GenericConflictError('Not enough active data nodes with available storage');
    }

    const responsibleDataNodes = selectResponsibleDataNodes(placementGroup, env.REPLICATION_FACTOR, candidateDataNodes);

    const part = await this.repository.createPartWithReplicas({
      part: {
        objectId: partInput.objectId,
        version: partInput.version,
        partNumber: partInput.partNumber,

        blobId,
        placementGroup,
        sizeBytes,
        checksumAlgorithm: BLOB_CHECKSUM_ALGORITHM,
        checksumValue
      },
      replicaDataNodeIds: responsibleDataNodes.map((dataNode) => dataNode.id)
    });

    await this.createPartReplicas(
      {
        blobId,
        sizeBytes,
        checksumAlgorithm: BLOB_CHECKSUM_ALGORITHM,
        checksumValue,
        bytes: partInput.bytes
      },
      responsibleDataNodes
    );

    return {
      part,
      responsibleDataNodes
    };
  }
  private async createPartReplicas(
    blob: BlobMetadataWithBytes,
    responsibleDataNodes: readonly DataNode[]
  ): Promise<void> {
    const createReplicaBlobResults: CreateReplicaBlobResult[] = [];
    const errors: unknown[] = [];

    for (const settledResult of await Promise.allSettled(
      responsibleDataNodes.map((dataNode) => this.createReplicaBlob(blob, dataNode))
    )) {
      if (settledResult.status === 'rejected') {
        errors.push(settledResult.reason);
        continue;
      }

      createReplicaBlobResults.push(settledResult.value);

      if (settledResult.value.status === 'rejected') {
        errors.push(settledResult.value.reason);
      }
    }

    try {
      await this.updateReplicaStatesFromCreateReplicaBlobResults(blob.blobId, createReplicaBlobResults);
    } catch (err) {
      errors.push(err);
    }

    if (errors.length > 0) {
      throw new GenericInternalServerError('Failed to replicate blob to all responsible data nodes', {
        cause: new AggregateError(errors)
      });
    }
  }

  private async createReplicaBlob(blob: BlobMetadataWithBytes, dataNode: DataNode): Promise<CreateReplicaBlobResult> {
    try {
      await this.blobService.ensureBlobExists({
        dataNodeEndpoint: mapDataNodeToDataNodeEndpoint(dataNode),
        blob
      });

      return {
        dataNodeId: dataNode.id,
        status: 'fulfilled'
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

  private async updateReplicaStatesFromCreateReplicaBlobResults(
    blobId: BlobId,
    results: readonly CreateReplicaBlobResult[]
  ): Promise<void> {
    const replicaStateUpdates: UpdateReplicaStatesRepositoryInput = [];

    for (const result of results) {
      const state = result.status === 'fulfilled' ? 'committed' : resolveFailedCreatePartReplicaState(result.reason);
      if (state === 'pending') {
        continue;
      }

      replicaStateUpdates.push({
        blobId,
        dataNodeId: result.dataNodeId,
        state
      });
    }

    if (replicaStateUpdates.length > 0) {
      await this.repository.updatePartReplicaStates(replicaStateUpdates);
    }
  }
}

/* exports */

export { ObjectVersionPartService };
export type { ObjectVersionPartServiceContract };
