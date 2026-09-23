import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import type { ObjectVersionPartRepositoryContract } from '@/modules/object-version-parts/object-version-part.repository';

import { DeletingObjectVersionCleanupHandler } from '../lifecycle/deleting-object-version-cleanup.handler';
import { ObjectLifecycleHandler } from '../lifecycle/object.lifecycle-handler';
import { PendingObjectVersionCleanupHandler } from '../lifecycle/pending-object-version-cleanup.handler';
import { objectConfig } from '../object.config';
import type { ObjectVersion } from '../object.domain';
import type { ObjectRepositoryContract } from '../object.repository';

/* fixtures */

const now = new Date('2026-01-02T00:00:00.000Z');

const pendingVersion: ObjectVersion = {
  objectId: '00000000-0000-4000-8000-000000000001',
  version: 1,
  state: 'pending',
  totalSizeBytes: 5n,
  contentType: 'application/octet-stream',
  createdAt: now,
  committedAt: null,
  updatedAt: now
};

const deletingVersion: ObjectVersion = {
  ...pendingVersion,
  state: 'deleting'
};

/* mocks */

const createObjectRepositoryMock = (): jest.Mocked<ObjectRepositoryContract> => {
  const repository = {
    listObjectVersions: jest.fn<ObjectRepositoryContract['listObjectVersions']>(),
    listPendingObjectVersionCleanupCandidates:
      jest.fn<ObjectRepositoryContract['listPendingObjectVersionCleanupCandidates']>(),
    listDeletingObjectVersionCleanupCandidates:
      jest.fn<ObjectRepositoryContract['listDeletingObjectVersionCleanupCandidates']>(),
    findObjectById: jest.fn<ObjectRepositoryContract['findObjectById']>(),
    findObjectByKey: jest.fn<ObjectRepositoryContract['findObjectByKey']>(),
    findObjectVersion: jest.fn<ObjectRepositoryContract['findObjectVersion']>(),
    upsertObjectAndCreateVersion: jest.fn<ObjectRepositoryContract['upsertObjectAndCreateVersion']>(),
    claimObjectVersionCleanup: jest.fn<ObjectRepositoryContract['claimObjectVersionCleanup']>(),
    commitObjectVersion: jest.fn<ObjectRepositoryContract['commitObjectVersion']>(),
    touchObjectVersionDeletionCandidate: jest.fn<ObjectRepositoryContract['touchObjectVersionDeletionCandidate']>(),
    deleteObjectVersionIfDeletingAndPartsGone:
      jest.fn<ObjectRepositoryContract['deleteObjectVersionIfDeletingAndPartsGone']>()
  };

  repository.listPendingObjectVersionCleanupCandidates.mockResolvedValue([]);
  repository.listDeletingObjectVersionCleanupCandidates.mockResolvedValue([]);
  repository.claimObjectVersionCleanup.mockResolvedValue(true);
  repository.deleteObjectVersionIfDeletingAndPartsGone.mockResolvedValue(true);

  return repository;
};

const createPartRepositoryMock = (): jest.Mocked<ObjectVersionPartRepositoryContract> => {
  return {
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
};

/* tests */

describe('object lifecycle handlers', () => {
  let objectRepository: jest.Mocked<ObjectRepositoryContract>;
  let partRepository: jest.Mocked<ObjectVersionPartRepositoryContract>;

  beforeEach(() => {
    objectRepository = createObjectRepositoryMock();
    partRepository = createPartRepositoryMock();
  });

  test('claims stale pending object versions for deletion', async () => {
    objectRepository.listPendingObjectVersionCleanupCandidates.mockResolvedValue([pendingVersion]);
    const handler = new PendingObjectVersionCleanupHandler(objectRepository);

    await handler.run(now);

    const updatedBefore = new Date(now.getTime() - objectConfig.lifecycle.pendingCleanupAfterMs);

    expect(objectRepository.listPendingObjectVersionCleanupCandidates).toHaveBeenCalledWith({
      updatedBefore,
      limit: objectConfig.lifecycle.pendingCleanupBatchSize
    });
    expect(objectRepository.claimObjectVersionCleanup).toHaveBeenCalledWith({
      objectId: pendingVersion.objectId,
      version: pendingVersion.version,
      updatedBefore
    });
  });

  test('deletes replicas, replica-free parts, and a deleting object version', async () => {
    objectRepository.listDeletingObjectVersionCleanupCandidates.mockResolvedValue([deletingVersion]);
    const handler = new DeletingObjectVersionCleanupHandler(objectRepository, partRepository);

    await handler.run();

    const key = { objectId: deletingVersion.objectId, version: deletingVersion.version };

    expect(partRepository.applyObjectVersionDeletionToPartReplicas).toHaveBeenCalledWith(key);
    expect(partRepository.deleteReplicaFreePartsByObjectVersion).toHaveBeenCalledWith(key);
    expect(objectRepository.deleteObjectVersionIfDeletingAndPartsGone).toHaveBeenCalledWith(key);
    expect(objectRepository.touchObjectVersionDeletionCandidate).not.toHaveBeenCalled();
  });

  test('touches a deleting object version when parts or replicas remain', async () => {
    objectRepository.listDeletingObjectVersionCleanupCandidates.mockResolvedValue([deletingVersion]);
    objectRepository.deleteObjectVersionIfDeletingAndPartsGone.mockResolvedValue(false);
    const handler = new DeletingObjectVersionCleanupHandler(objectRepository, partRepository);

    await handler.run();

    expect(objectRepository.touchObjectVersionDeletionCandidate).toHaveBeenCalledWith({
      objectId: deletingVersion.objectId,
      version: deletingVersion.version
    });
  });

  test('skips stale deletion candidates that no longer have deleting state', async () => {
    objectRepository.listDeletingObjectVersionCleanupCandidates.mockResolvedValue([pendingVersion]);
    const handler = new DeletingObjectVersionCleanupHandler(objectRepository, partRepository);

    await handler.run();

    expect(partRepository.applyObjectVersionDeletionToPartReplicas).not.toHaveBeenCalled();
    expect(objectRepository.deleteObjectVersionIfDeletingAndPartsGone).not.toHaveBeenCalled();
  });
});

describe('ObjectLifecycleHandler', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('runs pending and deleting cleanup flows together', async () => {
    const pendingRun = jest.fn<(currentTime: Date) => Promise<void>>().mockResolvedValue();
    const deletingRun = jest.fn<() => Promise<void>>().mockResolvedValue();
    const handler = new ObjectLifecycleHandler(
      { run: pendingRun } as unknown as PendingObjectVersionCleanupHandler,
      { run: deletingRun } as unknown as DeletingObjectVersionCleanupHandler
    );

    await handler.run();

    expect(pendingRun).toHaveBeenCalledWith(now);
    expect(deletingRun).toHaveBeenCalled();
  });
});
