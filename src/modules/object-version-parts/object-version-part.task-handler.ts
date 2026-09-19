import { randomUUID } from 'node:crypto';

import { GenericBadRequestError, GenericInternalServerError, GenericResourceExhaustedError } from '@/errors/application.errors';
import { InternodeAbortedError, InternodeApplicationError } from '@/errors/internode.errors';

import type { DataNodeBlobWithBytesInput } from '@/modules/blobs/blob.application';
import type { BlobConfig } from '@/modules/blobs/blob.config';
import { BLOB_CHECKSUM_ALGORITHM, type BlobMetadata, type BlobMetadataWithBytes } from '@/modules/blobs/blob.domain';
import type { BlobGrpcClientContract } from '@/modules/blobs/blob.grpc-client';
import { calculateBlobChecksum } from '@/modules/blobs/blob.processors';
import type { DataNode } from '@/modules/data-nodes/data-node.domain';
import { mapDataNodeToDataNodeEndpoint } from '@/modules/data-nodes/data-node.mappers';
import type { DataNodeServiceContract } from '@/modules/data-nodes/data-node.service';

import type {
  CreatePartInput,
  CreatePartResult,
  CreatePartWithReplicasRepositoryInput,
  CreatePartsInput,
  CreateReplicaBlobResult,
  UpdatePartReplicaStatesRepositoryInput
} from './object-version-part.application';
import type { PartConfig } from './object-version-part.config';
import type { Part } from './object-version-part.domain';
import { calculatePartPlacementGroup, selectResponsibleDataNodes } from './object-version-part.domain-policies';
import { splitObjectDataIntoPartBytes } from './object-version-part.processors';
import { resolveFailedCreatePartReplicaState } from './object-version-part.replica-state-resolvers';
import type { ObjectVersionPartRepositoryContract } from './object-version-part.repository';

/* contract */

type ObjectVersionPartTaskHandlerContract = {
  createPartsFromData(input: CreatePartsInput): Promise<Part[]>;
};

/* handler */

class ObjectVersionPartTaskHandler implements ObjectVersionPartTaskHandlerContract {
  constructor(
    private readonly repository: ObjectVersionPartRepositoryContract,
    private readonly dataNodeService: DataNodeServiceContract,
    private readonly blobGrpcClient: BlobGrpcClientContract,
    private readonly blobConfig: BlobConfig,
    private readonly partConfig: PartConfig
  ) {}

  async createPartsFromData(input: CreatePartsInput): Promise<Part[]> {
    const parts: Part[] = [];

    const activeDataNodes = await this.dataNodeService.listAvailableDataNodes();

    const remainingStorageByDataNodeId = new Map(activeDataNodes.map((dataNode) => [dataNode.id, dataNode.storageFreeBytes]));

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

      const createPartResult = await this.createPart({
        part: {
          objectId: input.objectId,
          version: input.version,
          partNumber,

          bytes: partBytes
        },
        availableDataNodes
      });

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

  private async createPartReplicas(blob: BlobMetadataWithBytes, responsibleDataNodes: readonly DataNode[]): Promise<void> {
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
      throw new GenericInternalServerError('Failed to create object version part replicas');
    }
  }

  private async createReplicaBlob(blob: BlobMetadataWithBytes, dataNode: DataNode): Promise<CreateReplicaBlobResult> {
    const putBlobInput: DataNodeBlobWithBytesInput = {
      blob,

      dataNodeEndpoint: mapDataNodeToDataNodeEndpoint(dataNode)
    };

    try {
      await this.putBlobWithAttempts(putBlobInput);

      return {
        dataNodeId: dataNode.id,
        status: 'fulfilled'
      };
    } catch (err) {
      if (err instanceof InternodeApplicationError) {
        return {
          dataNodeId: dataNode.id,
          status: 'rejected',
          reason: err
        };
      }

      throw err;
    }
  }

  private async putBlobWithAttempts(input: DataNodeBlobWithBytesInput): Promise<BlobMetadata> {
    for (let attempt = 0; attempt < this.blobConfig.maxPutAttempts; attempt += 1) {
      try {
        return await this.blobGrpcClient.putBlob(input);
      } catch (err) {
        if (!(err instanceof InternodeAbortedError)) {
          throw err;
        }
      }
    }

    throw new InternodeAbortedError('Failed to put blob on the data node after multiple attempts');
  }

  private async updateReplicaStatesFromCreateReplicaBlobResults(
    blobId: Part['blobId'],
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

export { ObjectVersionPartTaskHandler };
export type { ObjectVersionPartTaskHandlerContract };
