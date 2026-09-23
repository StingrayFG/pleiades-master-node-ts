import { Buffer } from 'node:buffer';
import { Readable } from 'node:stream';

import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
  GenericBadRequestError,
  GenericInternalServerError,
  GenericResourceExhaustedError
} from '@/errors/application.errors';
import { InternodeAbortedError, InternodeFailedPreconditionError } from '@/errors/internode.errors';
import type { BlobConfig } from '@/modules/blobs/blob.config';
import type { BlobGrpcClientContract } from '@/modules/blobs/blob.grpc-client';
import type { DataNode } from '@/modules/data-nodes/data-node.domain';
import type { DataNodeServiceContract } from '@/modules/data-nodes/data-node.service';

import type { PartConfig } from '../object-version-part.config';
import type { ObjectVersionPartRepositoryContract } from '../object-version-part.repository';
import { ObjectVersionPartTaskHandler } from '../object-version-part.task-handler';

/* fixtures */

const now = new Date('2026-01-01T00:00:00.000Z');

const blobConfig: BlobConfig = {
  maxSizeBytes: 3n,
  maxPutAttempts: 2
};

const partConfig: PartConfig = {
  placementGroupCount: 64,
  replicationFactor: 2,
  lifecycle: {
    repair: { afterMs: 1_000, batchSize: 10, concurrency: 2 },
    reconciliation: { afterMs: 1_000, maxAgeMs: 10_000, batchSize: 10 },
    verification: { afterMs: 1_000, batchSize: 10 },
    deletion: { afterMs: 1_000, batchSize: 10 }
  }
};

const createDataNode = (id: string): DataNode => ({
  id,
  certificateFingerprint: 'fingerprint',
  sessionId: '00000000-0000-4000-8000-000000000001',
  lastHeartbeatSequence: 1n,
  state: 'active',
  mode: 'serving',
  hostname: `${id}.internal`,
  port: 50051,
  scheme: 'grpcs',
  storageTotalBytes: 100n,
  storageFreeBytes: 100n,
  registeredAt: now,
  lastContactAt: now,
  lastHealthCheckAt: now,
  lastHeartbeatAt: now,
  updatedAt: now,
  revision: 0n
});

const dataNodes = [createDataNode('data-node-a'), createDataNode('data-node-b')];

/* mocks */

const createRepositoryMock = (): jest.Mocked<ObjectVersionPartRepositoryContract> => {
  const repository = {
    listPartsByObjectVersion: jest.fn<ObjectVersionPartRepositoryContract['listPartsByObjectVersion']>(),
    listPartReplicasByBlobId: jest.fn<ObjectVersionPartRepositoryContract['listPartReplicasByBlobId']>(),
    listPartReplicaVerificationCandidates:
      jest.fn<ObjectVersionPartRepositoryContract['listPartReplicaVerificationCandidates']>(),
    listPendingPartReplicaReconciliationCandidates:
      jest.fn<ObjectVersionPartRepositoryContract['listPendingPartReplicaReconciliationCandidates']>(),
    listPartReplicaRepairCandidates: jest.fn<ObjectVersionPartRepositoryContract['listPartReplicaRepairCandidates']>(),
    listPartReplicaDeletionCandidates:
      jest.fn<ObjectVersionPartRepositoryContract['listPartReplicaDeletionCandidates']>(),
    listCommittedPartReplicasByBlobId:
      jest.fn<ObjectVersionPartRepositoryContract['listCommittedPartReplicasByBlobId']>(),
    findPartByBlobId: jest.fn<ObjectVersionPartRepositoryContract['findPartByBlobId']>(),
    createPartWithReplicas: jest.fn<ObjectVersionPartRepositoryContract['createPartWithReplicas']>(),
    claimPartReplicaRepair: jest.fn<ObjectVersionPartRepositoryContract['claimPartReplicaRepair']>(),
    applyObjectVersionDeletionToPartReplicas:
      jest.fn<ObjectVersionPartRepositoryContract['applyObjectVersionDeletionToPartReplicas']>(),
    applyPartReplicaVerification: jest.fn<ObjectVersionPartRepositoryContract['applyPartReplicaVerification']>(),
    applyPartReplicaRepair: jest.fn<ObjectVersionPartRepositoryContract['applyPartReplicaRepair']>(),
    applyPendingPartReplicaReconciliation:
      jest.fn<ObjectVersionPartRepositoryContract['applyPendingPartReplicaReconciliation']>(),
    applyRedundantPartReplicaDeletion:
      jest.fn<ObjectVersionPartRepositoryContract['applyRedundantPartReplicaDeletion']>(),
    updatePartReplicaStates: jest.fn<ObjectVersionPartRepositoryContract['updatePartReplicaStates']>(),
    touchPartReplicaVerificationCandidate:
      jest.fn<ObjectVersionPartRepositoryContract['touchPartReplicaVerificationCandidate']>(),
    touchPartReplicaRepairCandidate: jest.fn<ObjectVersionPartRepositoryContract['touchPartReplicaRepairCandidate']>(),
    touchPartReplicaDeletionCandidate:
      jest.fn<ObjectVersionPartRepositoryContract['touchPartReplicaDeletionCandidate']>(),
    deletePartReplicaIfDeleting: jest.fn<ObjectVersionPartRepositoryContract['deletePartReplicaIfDeleting']>(),
    deleteReplicaFreePartsByObjectVersion:
      jest.fn<ObjectVersionPartRepositoryContract['deleteReplicaFreePartsByObjectVersion']>()
  };

  repository.createPartWithReplicas.mockImplementation(async (input) => ({ ...input.part, createdAt: now }));

  return repository;
};

const createDataNodeServiceMock = (): jest.Mocked<DataNodeServiceContract> => {
  const service = {
    listAvailableDataNodes: jest.fn<DataNodeServiceContract['listAvailableDataNodes']>(),
    getDataNodeById: jest.fn<DataNodeServiceContract['getDataNodeById']>(),
    registerDataNode: jest.fn<DataNodeServiceContract['registerDataNode']>(),
    applyDataNodeHeartbeat: jest.fn<DataNodeServiceContract['applyDataNodeHeartbeat']>(),
    checkDataNodeHealth: jest.fn<DataNodeServiceContract['checkDataNodeHealth']>()
  };

  service.listAvailableDataNodes.mockResolvedValue(dataNodes);

  return service;
};

const createBlobGrpcClientMock = (): jest.Mocked<BlobGrpcClientContract> => {
  const client = {
    headBlob: jest.fn<BlobGrpcClientContract['headBlob']>(),
    getBlob: jest.fn<BlobGrpcClientContract['getBlob']>(),
    verifyBlob: jest.fn<BlobGrpcClientContract['verifyBlob']>(),
    putBlob: jest.fn<BlobGrpcClientContract['putBlob']>(),
    deleteBlob: jest.fn<BlobGrpcClientContract['deleteBlob']>(),
    close: jest.fn<BlobGrpcClientContract['close']>()
  };

  client.putBlob.mockImplementation(async ({ blob }) => blob);

  return client;
};

/* tests */

describe('ObjectVersionPartTaskHandler', () => {
  let repository: jest.Mocked<ObjectVersionPartRepositoryContract>;
  let dataNodeService: jest.Mocked<DataNodeServiceContract>;
  let blobGrpcClient: jest.Mocked<BlobGrpcClientContract>;
  let handler: ObjectVersionPartTaskHandler;

  beforeEach(() => {
    repository = createRepositoryMock();
    dataNodeService = createDataNodeServiceMock();
    blobGrpcClient = createBlobGrpcClientMock();
    handler = new ObjectVersionPartTaskHandler(repository, dataNodeService, blobGrpcClient, blobConfig, partConfig);
  });

  test('splits object data, persists parts, replicates them, and commits replica states', async () => {
    const parts = await handler.createPartsFromData({
      objectId: '00000000-0000-4000-8000-000000000002',
      version: 1,
      totalSizeBytes: 5n,
      data: Readable.from([Buffer.from('abcde')])
    });

    expect(parts.map(({ partNumber, sizeBytes }) => ({ partNumber, sizeBytes }))).toEqual([
      { partNumber: 1, sizeBytes: 3n },
      { partNumber: 2, sizeBytes: 2n }
    ]);
    expect(repository.createPartWithReplicas).toHaveBeenCalledTimes(2);
    expect(blobGrpcClient.putBlob).toHaveBeenCalledTimes(4);
    expect(repository.updatePartReplicaStates).toHaveBeenCalledTimes(2);
    expect(repository.updatePartReplicaStates.mock.calls[0][0]).toHaveLength(2);
    expect(repository.updatePartReplicaStates.mock.calls[0][0].every(({ state }) => state === 'committed')).toBe(true);
  });

  test('persists successful and failed replica states when only part of replication succeeds', async () => {
    blobGrpcClient.putBlob.mockImplementation(async (input) => {
      if (input.dataNodeEndpoint.hostname === `${dataNodes[1].id}.internal`) {
        throw new InternodeFailedPreconditionError('missing', {
          blobId: input.blob.blobId,
          blobState: 'missing'
        });
      }

      return input.blob;
    });

    await expect(
      handler.createPartsFromData({
        objectId: '00000000-0000-4000-8000-000000000002',
        version: 1,
        totalSizeBytes: 3n,
        data: Readable.from([Buffer.from('abc')])
      })
    ).rejects.toBeInstanceOf(GenericInternalServerError);

    expect(blobGrpcClient.putBlob).toHaveBeenCalledTimes(2);
    expect(repository.updatePartReplicaStates).toHaveBeenCalledTimes(1);

    const stateUpdates = repository.updatePartReplicaStates.mock.calls[0][0];

    expect(stateUpdates).toHaveLength(2);
    expect(stateUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dataNodeId: dataNodes[0].id,
          expectedState: 'pending',
          state: 'committed'
        }),
        expect.objectContaining({
          dataNodeId: dataNodes[1].id,
          expectedState: 'pending',
          state: 'missing'
        })
      ])
    );
  });

  test.each([
    { totalSizeBytes: 4n, bytes: Buffer.from('abcde') },
    { totalSizeBytes: 6n, bytes: Buffer.from('abcde') }
  ])('rejects object data inconsistent with Content-Length', async ({ totalSizeBytes, bytes }) => {
    await expect(
      handler.createPartsFromData({
        objectId: '00000000-0000-4000-8000-000000000002',
        version: 1,
        totalSizeBytes,
        data: Readable.from([bytes])
      })
    ).rejects.toBeInstanceOf(GenericBadRequestError);
  });

  test('rejects part creation without enough storage-capable data nodes', async () => {
    dataNodeService.listAvailableDataNodes.mockResolvedValue([dataNodes[0]]);

    await expect(
      handler.createPartsFromData({
        objectId: '00000000-0000-4000-8000-000000000002',
        version: 1,
        totalSizeBytes: 3n,
        data: Readable.from([Buffer.from('abc')])
      })
    ).rejects.toBeInstanceOf(GenericResourceExhaustedError);
    expect(repository.createPartWithReplicas).not.toHaveBeenCalled();
  });

  test('retries aborted blob puts up to the configured attempt count', async () => {
    dataNodeService.listAvailableDataNodes.mockResolvedValue([dataNodes[0]]);
    blobGrpcClient.putBlob
      .mockRejectedValueOnce(new InternodeAbortedError())
      .mockImplementation(async ({ blob }) => blob);
    const singleReplicaConfig = { ...partConfig, replicationFactor: 1 };
    const singleReplicaHandler = new ObjectVersionPartTaskHandler(
      repository,
      dataNodeService,
      blobGrpcClient,
      blobConfig,
      singleReplicaConfig
    );

    await expect(
      singleReplicaHandler.createPartsFromData({
        objectId: '00000000-0000-4000-8000-000000000002',
        version: 1,
        totalSizeBytes: 3n,
        data: Readable.from([Buffer.from('abc')])
      })
    ).resolves.toHaveLength(1);
    expect(blobGrpcClient.putBlob).toHaveBeenCalledTimes(2);
  });

  test('persists a missing state and fails when a replica cannot be created', async () => {
    dataNodeService.listAvailableDataNodes.mockResolvedValue([dataNodes[0]]);
    blobGrpcClient.putBlob.mockRejectedValue(
      new InternodeFailedPreconditionError('missing', { blobId: 'blob', blobState: 'missing' })
    );
    const singleReplicaHandler = new ObjectVersionPartTaskHandler(
      repository,
      dataNodeService,
      blobGrpcClient,
      blobConfig,
      { ...partConfig, replicationFactor: 1 }
    );

    await expect(
      singleReplicaHandler.createPartsFromData({
        objectId: '00000000-0000-4000-8000-000000000002',
        version: 1,
        totalSizeBytes: 3n,
        data: Readable.from([Buffer.from('abc')])
      })
    ).rejects.toBeInstanceOf(GenericInternalServerError);
    expect(repository.updatePartReplicaStates).toHaveBeenCalledWith([
      expect.objectContaining({ expectedState: 'pending', state: 'missing' })
    ]);
  });
});
