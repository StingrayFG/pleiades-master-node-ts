import { Buffer } from 'node:buffer';

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import { GenericInternalServerError } from '@/errors/application.errors';
import { InternodeNotFoundError, InternodeUnavailableError } from '@/errors/internode.errors';
import { BLOB_CHECKSUM_ALGORITHM, type BlobMetadataWithBytes } from '@/modules/blobs/blob.domain';
import type { BlobServiceContract } from '@/modules/blobs/blob.service';
import type { DataNode } from '@/modules/data-nodes/data-node.domain';
import type { DataNodeServiceContract } from '@/modules/data-nodes/data-node.service';

import { ObjectVersionPartLifecycleHandler } from '../lifecycle/object-version-part.lifecycle-handler';
import { PartReplicaDeletionHandler } from '../lifecycle/part-replica-deletion.handler';
import { PartReplicaRepairHandler } from '../lifecycle/part-replica-repair.handler';
import { PartReplicaVerificationHandler } from '../lifecycle/part-replica-verification.handler';
import { PendingPartReplicaReconciliationHandler } from '../lifecycle/pending-part-replica-reconciliation.handler';
import type { PartConfig } from '../object-version-part.config';
import type { Part, PartReplica } from '../object-version-part.domain';
import type { ObjectVersionPartRepositoryContract } from '../object-version-part.repository';

/* fixtures */

const now = new Date('2026-01-02T00:00:00.000Z');

const config: PartConfig = {
  placementGroupCount: 64,
  replicationFactor: 2,
  lifecycle: {
    repair: { afterMs: 10_000, batchSize: 5, concurrency: 2 },
    reconciliation: { afterMs: 20_000, maxAgeMs: 60_000, batchSize: 6 },
    verification: { afterMs: 30_000, batchSize: 7 },
    deletion: { afterMs: 40_000, batchSize: 8 }
  }
};

const part: Part = {
  objectId: '00000000-0000-4000-8000-000000000001',
  version: 1,
  partNumber: 1,
  blobId: '00000000-0000-4000-8000-000000000002',
  placementGroup: 4,
  sizeBytes: 4n,
  checksumAlgorithm: BLOB_CHECKSUM_ALGORITHM,
  checksumValue: 'a'.repeat(64),
  createdAt: now
};

const createReplica = (state: PartReplica['state'] = 'committed'): PartReplica => ({
  blobId: part.blobId,
  dataNodeId: 'data-node-a',
  state,
  createdAt: now,
  lastVerifiedAt: null,
  stateChangedAt: now,
  updatedAt: now
});

const createDataNode = (state: DataNode['state'] = 'active'): DataNode => ({
  id: 'data-node-a',
  certificateFingerprint: 'fingerprint',
  sessionId: '00000000-0000-4000-8000-000000000003',
  lastHeartbeatSequence: 1n,
  state,
  mode: 'serving',
  hostname: 'data-node.internal',
  port: 50051,
  scheme: 'grpcs',
  storageTotalBytes: 1_000n,
  storageFreeBytes: 500n,
  registeredAt: now,
  lastContactAt: now,
  lastHealthCheckAt: now,
  lastHeartbeatAt: now,
  updatedAt: now,
  revision: 0n
});

const blob: BlobMetadataWithBytes = {
  blobId: part.blobId,
  sizeBytes: part.sizeBytes,
  checksumAlgorithm: part.checksumAlgorithm,
  checksumValue: part.checksumValue,
  bytes: Buffer.from('data')
};

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

  repository.listPartReplicaVerificationCandidates.mockResolvedValue([]);
  repository.listPendingPartReplicaReconciliationCandidates.mockResolvedValue([]);
  repository.listPartReplicaRepairCandidates.mockResolvedValue([]);
  repository.listPartReplicaDeletionCandidates.mockResolvedValue([]);
  repository.findPartByBlobId.mockResolvedValue(part);
  repository.listPartReplicasByBlobId.mockResolvedValue([]);
  repository.listCommittedPartReplicasByBlobId.mockResolvedValue([]);
  repository.claimPartReplicaRepair.mockResolvedValue(true);

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

  service.listAvailableDataNodes.mockResolvedValue([]);
  service.getDataNodeById.mockResolvedValue(createDataNode());

  return service;
};

const createBlobServiceMock = (): jest.Mocked<BlobServiceContract> => ({
  getBlobMetadata: jest.fn<BlobServiceContract['getBlobMetadata']>().mockResolvedValue(blob),
  getBlob: jest.fn<BlobServiceContract['getBlob']>().mockResolvedValue(blob),
  verifyBlob: jest.fn<BlobServiceContract['verifyBlob']>().mockResolvedValue(blob),
  ensureBlobExists: jest.fn<BlobServiceContract['ensureBlobExists']>().mockResolvedValue(blob),
  deleteBlob: jest.fn<BlobServiceContract['deleteBlob']>()
});

/* tests */

describe('PartReplicaVerificationHandler', () => {
  let repository: jest.Mocked<ObjectVersionPartRepositoryContract>;
  let dataNodeService: jest.Mocked<DataNodeServiceContract>;
  let blobService: jest.Mocked<BlobServiceContract>;

  beforeEach(() => {
    repository = createRepositoryMock();
    dataNodeService = createDataNodeServiceMock();
    blobService = createBlobServiceMock();
  });

  test('verifies committed replicas and records their verification time', async () => {
    const replica = createReplica();

    repository.listPartReplicaVerificationCandidates.mockResolvedValue([replica]);
    const handler = new PartReplicaVerificationHandler(repository, dataNodeService, blobService, config);

    await handler.run(now);

    expect(repository.listPartReplicaVerificationCandidates).toHaveBeenCalledWith({
      verifiedBefore: new Date(now.getTime() - config.lifecycle.verification.afterMs),
      limit: config.lifecycle.verification.batchSize
    });
    expect(repository.applyPartReplicaVerification).toHaveBeenCalledWith({
      blobId: replica.blobId,
      dataNodeId: replica.dataNodeId,
      state: 'committed',
      verifiedAt: now
    });
  });

  test('touches verification candidates assigned to inactive data nodes', async () => {
    const replica = createReplica();

    repository.listPartReplicaVerificationCandidates.mockResolvedValue([replica]);
    dataNodeService.getDataNodeById.mockResolvedValue(createDataNode('offline'));
    const handler = new PartReplicaVerificationHandler(repository, dataNodeService, blobService, config);

    await handler.run(now);

    expect(repository.touchPartReplicaVerificationCandidate).toHaveBeenCalledWith({
      blobId: replica.blobId,
      dataNodeId: replica.dataNodeId
    });
    expect(blobService.verifyBlob).not.toHaveBeenCalled();
  });

  test('marks missing replicas after a not-found verification result', async () => {
    const replica = createReplica();

    repository.listPartReplicaVerificationCandidates.mockResolvedValue([replica]);
    blobService.verifyBlob.mockRejectedValue(new InternodeNotFoundError());
    const handler = new PartReplicaVerificationHandler(repository, dataNodeService, blobService, config);

    await handler.run(now);

    expect(repository.applyPartReplicaVerification).toHaveBeenCalledWith({
      blobId: replica.blobId,
      dataNodeId: replica.dataNodeId,
      state: 'missing'
    });
  });
});

describe('PendingPartReplicaReconciliationHandler', () => {
  let repository: jest.Mocked<ObjectVersionPartRepositoryContract>;
  let dataNodeService: jest.Mocked<DataNodeServiceContract>;
  let blobService: jest.Mocked<BlobServiceContract>;

  beforeEach(() => {
    repository = createRepositoryMock();
    dataNodeService = createDataNodeServiceMock();
    blobService = createBlobServiceMock();
  });

  test('commits pending replicas found on active data nodes', async () => {
    const replica = { ...createReplica('pending'), stateChangedAt: now };

    repository.listPendingPartReplicaReconciliationCandidates.mockResolvedValue([replica]);
    const handler = new PendingPartReplicaReconciliationHandler(repository, dataNodeService, blobService, config);

    await handler.run(now);

    expect(repository.applyPendingPartReplicaReconciliation).toHaveBeenCalledWith({
      blobId: replica.blobId,
      dataNodeId: replica.dataNodeId,
      state: 'committed',
      verifiedAt: now
    });
  });

  test('keeps recent pending replicas pending and expires old replicas on inactive nodes', async () => {
    const recentReplica = { ...createReplica('pending'), stateChangedAt: now };
    const expiredReplica = {
      ...createReplica('pending'),
      dataNodeId: 'data-node-b',
      stateChangedAt: new Date(now.getTime() - config.lifecycle.reconciliation.maxAgeMs)
    };

    repository.listPendingPartReplicaReconciliationCandidates.mockResolvedValue([recentReplica, expiredReplica]);
    dataNodeService.getDataNodeById.mockResolvedValue(createDataNode('offline'));
    const handler = new PendingPartReplicaReconciliationHandler(repository, dataNodeService, blobService, config);

    await handler.run(now);

    expect(repository.applyPendingPartReplicaReconciliation).toHaveBeenNthCalledWith(1, {
      blobId: recentReplica.blobId,
      dataNodeId: recentReplica.dataNodeId,
      state: 'pending'
    });
    expect(repository.applyPendingPartReplicaReconciliation).toHaveBeenNthCalledWith(2, {
      blobId: expiredReplica.blobId,
      dataNodeId: expiredReplica.dataNodeId,
      state: 'missing'
    });
  });
});

describe('PartReplicaDeletionHandler', () => {
  let repository: jest.Mocked<ObjectVersionPartRepositoryContract>;
  let dataNodeService: jest.Mocked<DataNodeServiceContract>;
  let blobService: jest.Mocked<BlobServiceContract>;

  beforeEach(() => {
    repository = createRepositoryMock();
    dataNodeService = createDataNodeServiceMock();
    blobService = createBlobServiceMock();
  });

  test('deletes blob data and then removes deleting replica metadata', async () => {
    const replica = createReplica('deleting');

    repository.listPartReplicaDeletionCandidates.mockResolvedValue([replica]);
    const handler = new PartReplicaDeletionHandler(repository, dataNodeService, blobService, config);

    await handler.run(now);

    expect(blobService.deleteBlob).toHaveBeenCalled();
    expect(repository.deletePartReplicaIfDeleting).toHaveBeenCalledWith({
      blobId: replica.blobId,
      dataNodeId: replica.dataNodeId
    });
  });

  test('treats missing blob data as an already completed deletion', async () => {
    const replica = createReplica('deleting');

    repository.listPartReplicaDeletionCandidates.mockResolvedValue([replica]);
    blobService.deleteBlob.mockRejectedValue(new InternodeNotFoundError());
    const handler = new PartReplicaDeletionHandler(repository, dataNodeService, blobService, config);

    await handler.run(now);

    expect(repository.deletePartReplicaIfDeleting).toHaveBeenCalled();
    expect(repository.touchPartReplicaDeletionCandidate).not.toHaveBeenCalled();
  });

  test('touches deletion candidates when their node is inactive or temporarily unavailable', async () => {
    const replica = createReplica('deleting');

    repository.listPartReplicaDeletionCandidates.mockResolvedValue([replica]);
    dataNodeService.getDataNodeById.mockResolvedValueOnce(createDataNode('offline'));
    const handler = new PartReplicaDeletionHandler(repository, dataNodeService, blobService, config);

    await handler.run(now);

    expect(repository.touchPartReplicaDeletionCandidate).toHaveBeenCalledWith({
      blobId: replica.blobId,
      dataNodeId: replica.dataNodeId
    });

    jest.clearAllMocks();
    repository.listPartReplicaDeletionCandidates.mockResolvedValue([replica]);
    dataNodeService.getDataNodeById.mockResolvedValue(createDataNode());
    blobService.deleteBlob.mockRejectedValue(new InternodeUnavailableError());

    await handler.run(now);

    expect(repository.touchPartReplicaDeletionCandidate).toHaveBeenCalled();
    expect(repository.deletePartReplicaIfDeleting).not.toHaveBeenCalled();
  });
});

describe('PartReplicaRepairHandler', () => {
  test('marks a failed replica deleting when enough effective replicas already exist', async () => {
    const repository = createRepositoryMock();
    const failedReplica = createReplica('missing');

    repository.listPartReplicaRepairCandidates.mockResolvedValue([failedReplica]);
    repository.listPartReplicasByBlobId.mockResolvedValue([
      { ...createReplica('committed'), dataNodeId: 'data-node-b' },
      { ...createReplica('pending'), dataNodeId: 'data-node-c' },
      failedReplica
    ]);
    const handler = new PartReplicaRepairHandler(
      repository,
      createDataNodeServiceMock(),
      createBlobServiceMock(),
      config
    );

    await handler.run(now);

    expect(repository.applyRedundantPartReplicaDeletion).toHaveBeenCalledWith({
      blobId: failedReplica.blobId,
      dataNodeId: failedReplica.dataNodeId,
      expectedState: 'missing'
    });
    expect(repository.claimPartReplicaRepair).not.toHaveBeenCalled();
  });

  test('aggregates repair failures with replica identity as the source', async () => {
    const repository = createRepositoryMock();
    const failedReplica = createReplica('corrupt');

    repository.listPartReplicaRepairCandidates.mockResolvedValue([failedReplica]);
    repository.findPartByBlobId.mockResolvedValue(null);
    const handler = new PartReplicaRepairHandler(
      repository,
      createDataNodeServiceMock(),
      createBlobServiceMock(),
      config
    );

    let thrown: unknown;

    try {
      await handler.run(now);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(GenericInternalServerError);
    expect(((thrown as Error).cause as AggregateError).errors).toEqual([
      { source: `${failedReplica.blobId}:${failedReplica.dataNodeId}`, error: expect.any(GenericInternalServerError) }
    ]);
  });
});

describe('ObjectVersionPartLifecycleHandler', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('runs every lifecycle flow and aggregates failures by source', async () => {
    const verificationError = new Error('verification failed');
    const repairError = new Error('repair failed');
    const verificationRun = jest.fn<(currentTime: Date) => Promise<void>>().mockRejectedValue(verificationError);
    const reconciliationRun = jest.fn<(currentTime: Date) => Promise<void>>().mockResolvedValue();
    const repairRun = jest.fn<(currentTime: Date) => Promise<void>>().mockRejectedValue(repairError);
    const deletionRun = jest.fn<(currentTime: Date) => Promise<void>>().mockResolvedValue();
    const handler = new ObjectVersionPartLifecycleHandler(
      { run: verificationRun } as unknown as PartReplicaVerificationHandler,
      { run: reconciliationRun } as unknown as PendingPartReplicaReconciliationHandler,
      { run: repairRun } as unknown as PartReplicaRepairHandler,
      { run: deletionRun } as unknown as PartReplicaDeletionHandler
    );

    let thrown: unknown;

    try {
      await handler.run();
    } catch (err) {
      thrown = err;
    }

    expect(verificationRun).toHaveBeenCalledWith(now);
    expect(reconciliationRun).toHaveBeenCalledWith(now);
    expect(repairRun).toHaveBeenCalledWith(now);
    expect(deletionRun).toHaveBeenCalledWith(now);
    expect(thrown).toBeInstanceOf(GenericInternalServerError);
    expect(((thrown as Error).cause as AggregateError).errors).toEqual([
      { source: 'verification', error: verificationError },
      { source: 'repair', error: repairError }
    ]);
  });
});
