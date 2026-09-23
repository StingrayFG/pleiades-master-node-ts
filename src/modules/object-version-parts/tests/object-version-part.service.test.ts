import { Buffer } from 'node:buffer';

import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { GenericDataLossError, GenericInternalServerError, GenericNotFoundError } from '@/errors/application.errors';
import { InternodeNotFoundError } from '@/errors/internode.errors';
import { BLOB_CHECKSUM_ALGORITHM, type BlobMetadataWithBytes } from '@/modules/blobs/blob.domain';
import type { BlobServiceContract } from '@/modules/blobs/blob.service';
import type { DataNode } from '@/modules/data-nodes/data-node.domain';
import type { DataNodeServiceContract } from '@/modules/data-nodes/data-node.service';

import type { Part, PartReplica } from '../object-version-part.domain';
import type { ObjectVersionPartRepositoryContract } from '../object-version-part.repository';
import { ObjectVersionPartService } from '../object-version-part.service';

/* fixtures */

const now = new Date('2026-01-01T00:00:00.000Z');

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

const createReplica = (dataNodeId: string): PartReplica => ({
  blobId: part.blobId,
  dataNodeId,
  state: 'committed',
  createdAt: now,
  lastVerifiedAt: now,
  stateChangedAt: now,
  updatedAt: now
});

const replicas = [createReplica('data-node-a'), createReplica('data-node-b')];

const createDataNode = (id: string): DataNode => ({
  id,
  certificateFingerprint: 'fingerprint',
  sessionId: '00000000-0000-4000-8000-000000000003',
  lastHeartbeatSequence: 1n,
  state: 'active',
  mode: 'serving',
  hostname: `${id}.internal`,
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

  repository.listPartsByObjectVersion.mockResolvedValue([part]);
  repository.findPartByBlobId.mockResolvedValue(part);
  repository.listCommittedPartReplicasByBlobId.mockResolvedValue(replicas);

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

  service.getDataNodeById.mockImplementation(async (id) => createDataNode(id));

  return service;
};

const createBlobServiceMock = (): jest.Mocked<BlobServiceContract> => ({
  getBlobMetadata: jest.fn<BlobServiceContract['getBlobMetadata']>(),
  getBlob: jest.fn<BlobServiceContract['getBlob']>().mockResolvedValue(blob),
  verifyBlob: jest.fn<BlobServiceContract['verifyBlob']>(),
  ensureBlobExists: jest.fn<BlobServiceContract['ensureBlobExists']>(),
  deleteBlob: jest.fn<BlobServiceContract['deleteBlob']>()
});

/* tests */

describe('ObjectVersionPartService', () => {
  let repository: jest.Mocked<ObjectVersionPartRepositoryContract>;
  let dataNodeService: jest.Mocked<DataNodeServiceContract>;
  let blobService: jest.Mocked<BlobServiceContract>;
  let service: ObjectVersionPartService;

  beforeEach(() => {
    repository = createRepositoryMock();
    dataNodeService = createDataNodeServiceMock();
    blobService = createBlobServiceMock();
    service = new ObjectVersionPartService(repository, dataNodeService, blobService);
  });

  test('lists parts through the repository', async () => {
    await expect(service.listPartsByObjectVersion({ objectId: part.objectId, version: part.version })).resolves.toEqual(
      [part]
    );
    expect(repository.listPartsByObjectVersion).toHaveBeenCalledWith(part.objectId, part.version);
  });

  test('rejects missing parts and parts without committed replicas', async () => {
    repository.findPartByBlobId.mockResolvedValueOnce(null);

    await expect(service.getPartBlob(part.blobId)).rejects.toBeInstanceOf(GenericNotFoundError);

    repository.listCommittedPartReplicasByBlobId.mockResolvedValue([]);

    await expect(service.getPartBlob(part.blobId)).rejects.toBeInstanceOf(GenericInternalServerError);
  });

  test('returns the first readable replica whose metadata matches the part', async () => {
    await expect(service.getPartBlob(part.blobId)).resolves.toBe(blob);

    expect(dataNodeService.getDataNodeById).toHaveBeenCalledWith(replicas[0].dataNodeId);
    expect(blobService.getBlob).toHaveBeenCalledTimes(1);
    expect(repository.updatePartReplicaStates).not.toHaveBeenCalled();
  });

  test('marks a missing replica and continues to the next committed replica', async () => {
    blobService.getBlob.mockRejectedValueOnce(new InternodeNotFoundError()).mockResolvedValueOnce(blob);

    await expect(service.getPartBlob(part.blobId)).resolves.toBe(blob);

    expect(repository.updatePartReplicaStates).toHaveBeenCalledWith([
      {
        blobId: part.blobId,
        dataNodeId: replicas[0].dataNodeId,
        expectedState: 'committed',
        state: 'missing'
      }
    ]);
    expect(blobService.getBlob).toHaveBeenCalledTimes(2);
  });

  test('reports data loss after every committed replica is missing', async () => {
    blobService.getBlob.mockRejectedValue(new InternodeNotFoundError());

    await expect(service.getPartBlob(part.blobId)).rejects.toBeInstanceOf(GenericDataLossError);
    expect(repository.updatePartReplicaStates).toHaveBeenCalledTimes(replicas.length);
  });

  test('propagates unexpected blob-client failures immediately', async () => {
    const error = new Error('unexpected failure');

    blobService.getBlob.mockRejectedValue(error);

    await expect(service.getPartBlob(part.blobId)).rejects.toBe(error);
    expect(blobService.getBlob).toHaveBeenCalledTimes(1);
  });

  test('reports an internal error when replica state persistence fails', async () => {
    blobService.getBlob.mockRejectedValue(new InternodeNotFoundError());
    repository.updatePartReplicaStates.mockRejectedValue(new Error('database failed'));

    await expect(service.getPartBlob(part.blobId)).rejects.toBeInstanceOf(GenericInternalServerError);
  });
});
