import { randomUUID } from 'node:crypto';

import {
  GenericBadRequestError,
  GenericInternalServerError,
  GenericNotFoundError,
  GenericResourceExhaustedError
} from '@/errors/application.errors';
import { InternodeApplicationError } from '@/errors/internode.errors';

import type { DataNodeBlobInput, DataNodeBlobWithBytesInput } from '@/modules/blobs/blob.application';
import type { BlobConfig } from '@/modules/blobs/blob.config';
import { BLOB_CHECKSUM_ALGORITHM, type BlobId, type BlobMetadataWithBytes } from '@/modules/blobs/blob.domain';
import { calculateBlobChecksum } from '@/modules/blobs/blob.processors';
import type { BlobServiceContract } from '@/modules/blobs/blob.service';
import type { DataNode, DataNodeId } from '@/modules/data-nodes/data-node.domain';
import { mapDataNodeToDataNodeEndpoint } from '@/modules/data-nodes/data-node.mappers';
import type { DataNodeServiceContract } from '@/modules/data-nodes/data-node.service';

import type {
  CreatePartInput,
  CreatePartResult,
  CreatePartsInput,
  CreatePartWithReplicasRepositoryInput,
  CreateReplicaBlobResult,
  GetReplicaBlobResult,
  ListPartsByObjectVersionInput,
  UpdatePartReplicaStatesRepositoryInput
} from './object-version-part.application';
import type { PartConfig } from './object-version-part.config';
import type { Part, PartReplica } from './object-version-part.domain';
import { calculatePartPlacementGroup, selectResponsibleDataNodes } from './object-version-part.domain-policies';
import {
  type CreatePartReplicasError,
  type GetPartBlobError,
  resolveFailedCreatePartReplicasError,
  resolveFailedGetPartBlobError
} from './object-version-part.error-resolvers';
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
    private readonly blobService: BlobServiceContract,
    private readonly blobConfig: BlobConfig,
    private readonly partConfig: PartConfig
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

    const activeDataNodes = await this.dataNodeService.listAvailableDataNodes();

    const remainingStorageByDataNodeId = new Map<DataNodeId, bigint>(
      activeDataNodes.map((dataNode) => [dataNode.id, dataNode.storageFreeBytes])
    );

    let receivedSizeBytes = 0n;
    let partNumber = 1;

    for await (const partBytes of splitObjectDataIntoPartBytes(input.data, Number(this.blobConfig.maxSizeBytes))) {
      const sizeBytes = BigInt(partBytes.length);
      receivedSizeBytes += sizeBytes;
      if (receivedSizeBytes > input.totalSizeBytes) {
        throw new GenericBadRequestError('Content-Length does not match object data size');
      }

      const availableDataNodes = activeDataNodes.map((dataNode) => ({
        ...dataNode,
        storageFreeBytes: remainingStorageByDataNodeId.get(dataNode.id) ?? dataNode.storageFreeBytes
      }));

      const createPartInput: CreatePartInput = {
        part: {
          objectId: input.objectId,
          version: input.version,
          partNumber,
          bytes: partBytes
        },
        availableDataNodes
      };

      const createPartResult = await this.createPart(createPartInput);

      for (const dataNode of createPartResult.responsibleDataNodes) {
        const remainingStorage = remainingStorageByDataNodeId.get(dataNode.id);

        if (remainingStorage !== undefined) {
          remainingStorageByDataNodeId.set(dataNode.id, remainingStorage - sizeBytes);
        }
      }

      parts.push(createPartResult.part);

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

  /* create helpers */

  private async createPart(input: CreatePartInput): Promise<CreatePartResult> {
    const partInput = input.part;

    const blobId = randomUUID();
    const placementGroup = calculatePartPlacementGroup(blobId, this.partConfig.placementGroupCount);
    const sizeBytes = BigInt(partInput.bytes.length);
    const checksumValue = calculateBlobChecksum(partInput.bytes);

    const candidateDataNodes = input.availableDataNodes.filter((dataNode) => dataNode.storageFreeBytes >= sizeBytes);

    if (candidateDataNodes.length < this.partConfig.replicationFactor) {
      throw new GenericResourceExhaustedError('Not enough available data nodes with sufficient storage');
    }

    const responsibleDataNodes = selectResponsibleDataNodes(
      placementGroup,
      this.partConfig.replicationFactor,
      candidateDataNodes
    );

    const createPartRepositoryInput: CreatePartWithReplicasRepositoryInput = {
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
    };

    const part = await this.repository.createPartWithReplicas(createPartRepositoryInput);

    const blob: BlobMetadataWithBytes = {
      blobId,
      sizeBytes,
      checksumAlgorithm: BLOB_CHECKSUM_ALGORITHM,
      checksumValue,
      bytes: partInput.bytes
    };

    await this.createPartReplicas(blob, responsibleDataNodes);

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
    const errors: CreatePartReplicasError[] = [];

    for (const settledResult of await Promise.allSettled(
      responsibleDataNodes.map((dataNode) => this.createReplicaBlob(blob, dataNode))
    )) {
      if (settledResult.status === 'rejected') {
        errors.push({
          source: 'replica-create',
          error: settledResult.reason
        });

        continue;
      }

      createReplicaBlobResults.push(settledResult.value);

      if (settledResult.value.status === 'rejected') {
        errors.push({
          source: 'replica-create',
          error: settledResult.value.reason
        });
      }
    }

    try {
      await this.updateReplicaStatesFromCreateReplicaBlobResults(blob.blobId, createReplicaBlobResults);
    } catch (err) {
      errors.push({ source: 'replica-state-update', error: err });
    }

    if (errors.length > 0) {
      throw resolveFailedCreatePartReplicasError(errors);
    }
  }

  private async createReplicaBlob(blob: BlobMetadataWithBytes, dataNode: DataNode): Promise<CreateReplicaBlobResult> {
    try {
      const ensureBlobExistsInput: DataNodeBlobWithBytesInput = {
        blob,
        dataNodeEndpoint: mapDataNodeToDataNodeEndpoint(dataNode)
      };

      await this.blobService.ensureBlobExists(ensureBlobExistsInput);

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
    createReplicaBlobResults: readonly CreateReplicaBlobResult[]
  ): Promise<void> {
    const updateStatesInput: UpdatePartReplicaStatesRepositoryInput = [];

    for (const createReplicaBlobResult of createReplicaBlobResults) {
      const state =
        createReplicaBlobResult.status === 'fulfilled'
          ? 'committed'
          : resolveFailedCreatePartReplicaState(createReplicaBlobResult.reason);
      if (state === 'pending') {
        continue;
      }

      updateStatesInput.push({
        blobId,
        dataNodeId: createReplicaBlobResult.dataNodeId,
        expectedState: 'pending',
        state
      });
    }

    if (updateStatesInput.length > 0) {
      await this.repository.updatePartReplicaStates(updateStatesInput);
    }
  }
}

/* exports */

export { ObjectVersionPartService };
export type { ObjectVersionPartServiceContract };
