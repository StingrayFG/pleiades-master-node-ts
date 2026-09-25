import { Buffer } from 'node:buffer';

import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { GenericConflictError, GenericFailedPreconditionError } from '@/errors/application.errors';
import type { ByteStorageServiceContract } from '@/modules/byte-storage/byte-storage.service';
import { CLUSTER_RECORD_ID, type Cluster } from '@/modules/cluster/cluster.domain';
import type { ClusterServiceContract } from '@/modules/cluster/cluster.service';
import type { ConsensusState } from '@/modules/consensus/consensus.domain';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { PersistedTask } from '@/modules/tasks/task.domain';
import type { TaskRepositoryContract } from '@/modules/tasks/task.repository';

import type { MasterNode } from '../master-node.domain';
import { MasterNodeInternodeService } from '../master-node.internode-service';
import type { MasterNodeServiceContract } from '../master-node.service';

/* fixtures */

const now = new Date('2026-01-01T00:00:00.000Z');
const payloadId = '00000000-0000-4000-8000-000000000003';
const selfMasterNodeId = 'master-node-a';
const selfMasterNodeSessionId = '00000000-0000-4000-8000-000000000001';
const clusterId = '00000000-0000-4000-8000-000000000010';
const followerMasterNodeId = 'master-node-follower';
const followerMasterNodeSessionId = '00000000-0000-4000-8000-000000000004';
const followerCertificateFingerprint = 'ab'.repeat(32);

const cluster: Cluster = {
  id: CLUSTER_RECORD_ID,
  clusterId,
  createdAt: now,
  updatedAt: now
};

const consensusState: ConsensusState = {
  id: 'self',
  currentEpoch: 2n,
  leaderMasterId: selfMasterNodeId,
  lastAllocatedSequence: 5n,
  lastCommittedSequence: 4n,
  lastAppliedSequence: 3n,
  createdAt: now,
  updatedAt: now,
  revision: 2n
};

const task: PersistedTask = {
  id: '00000000-0000-4000-8000-000000000002',
  originMasterNodeId: selfMasterNodeId,
  epoch: 2n,
  sequence: 4n,
  state: 'pending',
  revision: 0n,
  type: 'bucket.create',
  executionScope: 'cluster',
  data: { bucketName: 'test-bucket' },
  payloadId,
  createdAt: now,
  updatedAt: now
};

const followerMasterNode: MasterNode = {
  id: followerMasterNodeId,
  certificateFingerprint: followerCertificateFingerprint,
  sessionId: followerMasterNodeSessionId,
  state: 'active',
  mode: 'serving',
  hostname: 'follower.internal',
  port: 4410,
  scheme: 'grpcs',
  registeredAt: now,
  lastContactAt: now,
  lastHealthCheckAt: null,
  lastHeartbeatAt: null,
  updatedAt: now,
  revision: 1n
};

/* mocks */

const createTaskRepositoryMock = (): jest.Mocked<TaskRepositoryContract> => {
  const repository = {
    listTasksInSequenceRange: jest.fn<TaskRepositoryContract['listTasksInSequenceRange']>(),
    listPayloadCleanupCandidates: jest.fn<TaskRepositoryContract['listPayloadCleanupCandidates']>(),
    listUncommittedCleanupCandidates: jest.fn<TaskRepositoryContract['listUncommittedCleanupCandidates']>(),
    listExecutionsByTaskId: jest.fn<TaskRepositoryContract['listExecutionsByTaskId']>(),
    findById: jest.fn<TaskRepositoryContract['findById']>(),
    create: jest.fn<TaskRepositoryContract['create']>(),
    createExecutions: jest.fn<TaskRepositoryContract['createExecutions']>(),
    markExecutionExecuting: jest.fn<TaskRepositoryContract['markExecutionExecuting']>(),
    markExecutionCompleted: jest.fn<TaskRepositoryContract['markExecutionCompleted']>(),
    markExecutionFailed: jest.fn<TaskRepositoryContract['markExecutionFailed']>(),
    updateTaskState: jest.fn<TaskRepositoryContract['updateTaskState']>(),
    clearPayloadId: jest.fn<TaskRepositoryContract['clearPayloadId']>()
  };

  repository.listTasksInSequenceRange.mockResolvedValue([task]);

  return repository;
};

const createConsensusServiceMock = (): jest.Mocked<ConsensusServiceContract> => {
  const service = {
    getConsensusState: jest.fn<ConsensusServiceContract['getConsensusState']>(),
    advanceLastCommittedSequence: jest.fn<ConsensusServiceContract['advanceLastCommittedSequence']>(),
    advanceLastAppliedSequence: jest.fn<ConsensusServiceContract['advanceLastAppliedSequence']>(),
    withAdvancedLastAllocatedSequence: jest.fn<ConsensusServiceContract['withAdvancedLastAllocatedSequence']>(),
    bootstrapLeadership: jest.fn<ConsensusServiceContract['bootstrapLeadership']>()
  };

  service.getConsensusState.mockResolvedValue(consensusState);

  return service as unknown as jest.Mocked<ConsensusServiceContract>;
};

const createByteStorageServiceMock = (): jest.Mocked<ByteStorageServiceContract> => {
  const service = {
    store: jest.fn<ByteStorageServiceContract['store']>(),
    retrieve: jest.fn<ByteStorageServiceContract['retrieve']>(),
    delete: jest.fn<ByteStorageServiceContract['delete']>()
  };

  service.retrieve.mockResolvedValue(Buffer.from('task payload'));

  return service;
};

const createClusterServiceMock = (): jest.Mocked<ClusterServiceContract> => {
  return {
    getCluster: jest.fn<ClusterServiceContract['getCluster']>().mockResolvedValue(cluster),
    initializeCluster: jest.fn<ClusterServiceContract['initializeCluster']>(),
    registerCluster: jest.fn<ClusterServiceContract['registerCluster']>()
  };
};

const createMasterNodeServiceMock = (): jest.Mocked<MasterNodeServiceContract> => {
  return {
    getMasterNodeById: jest.fn<MasterNodeServiceContract['getMasterNodeById']>(),
    registerMasterNode: jest.fn<MasterNodeServiceContract['registerMasterNode']>().mockResolvedValue(followerMasterNode)
  } as unknown as jest.Mocked<MasterNodeServiceContract>;
};

/* tests */

describe('MasterNodeInternodeService', () => {
  let taskRepository: jest.Mocked<TaskRepositoryContract>;
  let consensusService: jest.Mocked<ConsensusServiceContract>;
  let byteStorageService: jest.Mocked<ByteStorageServiceContract>;
  let clusterService: jest.Mocked<ClusterServiceContract>;
  let masterNodeService: jest.Mocked<MasterNodeServiceContract>;
  let service: MasterNodeInternodeService;

  beforeEach(() => {
    taskRepository = createTaskRepositoryMock();
    consensusService = createConsensusServiceMock();
    byteStorageService = createByteStorageServiceMock();
    clusterService = createClusterServiceMock();
    masterNodeService = createMasterNodeServiceMock();
    service = new MasterNodeInternodeService(
      taskRepository,
      consensusService,
      byteStorageService,
      selfMasterNodeId,
      selfMasterNodeSessionId,
      clusterService,
      masterNodeService
    );
  });

  test('returns master information when the local master node is the leader', async () => {
    await expect(service.fetchMasterInfo()).resolves.toEqual({
      masterId: selfMasterNodeId,
      sessionId: selfMasterNodeSessionId,
      clusterId,
      epoch: consensusState.currentEpoch
    });
    expect(clusterService.getCluster).toHaveBeenCalledWith();
  });

  test('registers a master node in the local cluster using its authenticated certificate', async () => {
    await expect(
      service.registerMasterNode({
        id: followerMasterNodeId,
        certificateFingerprint: followerCertificateFingerprint,
        sessionId: followerMasterNodeSessionId,
        clusterId,
        endpoint: {
          hostname: followerMasterNode.hostname,
          port: followerMasterNode.port,
          scheme: followerMasterNode.scheme
        }
      })
    ).resolves.toBeUndefined();

    expect(masterNodeService.registerMasterNode).toHaveBeenCalledWith({
      id: followerMasterNodeId,
      certificateFingerprint: followerCertificateFingerprint,
      sessionId: followerMasterNodeSessionId,
      state: 'active',
      mode: 'serving',
      endpoint: {
        hostname: followerMasterNode.hostname,
        port: followerMasterNode.port,
        scheme: followerMasterNode.scheme
      }
    });
  });

  test('rejects registration from a different cluster', async () => {
    await expect(
      service.registerMasterNode({
        id: followerMasterNodeId,
        certificateFingerprint: followerCertificateFingerprint,
        sessionId: followerMasterNodeSessionId,
        clusterId: '00000000-0000-4000-8000-000000000099',
        endpoint: {
          hostname: followerMasterNode.hostname,
          port: followerMasterNode.port,
          scheme: followerMasterNode.scheme
        }
      })
    ).rejects.toBeInstanceOf(GenericConflictError);

    expect(masterNodeService.registerMasterNode).not.toHaveBeenCalled();
  });

  test('rejects discovery and registration when the local master node is not the leader', async () => {
    consensusService.getConsensusState.mockResolvedValue({
      ...consensusState,
      leaderMasterId: 'master-node-b'
    });

    await expect(service.fetchMasterInfo()).rejects.toBeInstanceOf(GenericFailedPreconditionError);
    await expect(
      service.registerMasterNode({
        id: followerMasterNodeId,
        certificateFingerprint: followerCertificateFingerprint,
        sessionId: followerMasterNodeSessionId,
        clusterId,
        endpoint: {
          hostname: followerMasterNode.hostname,
          port: followerMasterNode.port,
          scheme: followerMasterNode.scheme
        }
      })
    ).rejects.toBeInstanceOf(GenericFailedPreconditionError);
    expect(clusterService.getCluster).not.toHaveBeenCalled();
    expect(masterNodeService.registerMasterNode).not.toHaveBeenCalled();
  });

  test('fetches committed task entries in sequence order bounds', async () => {
    await expect(service.fetchTaskEntries({ afterSequence: -1n, limit: 32 })).resolves.toEqual({
      epoch: consensusState.currentEpoch,
      lastCommittedSequence: consensusState.lastCommittedSequence,
      entries: [
        {
          id: task.id,
          originMasterNodeId: task.originMasterNodeId,
          epoch: task.epoch,
          sequence: task.sequence,
          type: task.type,
          executionScope: task.executionScope,
          data: task.data,
          payloadId: task.payloadId,
          createdAt: task.createdAt
        }
      ]
    });
    expect(consensusService.getConsensusState).toHaveBeenCalledWith();
    expect(taskRepository.listTasksInSequenceRange).toHaveBeenCalledWith({
      afterSequence: -1n,
      upToSequence: consensusState.lastCommittedSequence,
      limit: 32
    });
  });

  test('returns an empty entry list when no committed tasks are available', async () => {
    taskRepository.listTasksInSequenceRange.mockResolvedValue([]);

    await expect(service.fetchTaskEntries({ afterSequence: 4n, limit: 8 })).resolves.toEqual({
      epoch: consensusState.currentEpoch,
      lastCommittedSequence: consensusState.lastCommittedSequence,
      entries: []
    });
  });

  test('retrieves a task payload from byte storage', async () => {
    const payload = Buffer.from('task payload');

    await expect(service.fetchTaskPayload({ payloadId })).resolves.toEqual(payload);
    expect(byteStorageService.retrieve).toHaveBeenCalledWith(payloadId);
  });

  test('propagates task repository failures', async () => {
    const repositoryError = new Error('Task storage unavailable');

    taskRepository.listTasksInSequenceRange.mockRejectedValue(repositoryError);

    await expect(service.fetchTaskEntries({ afterSequence: -1n, limit: 32 })).rejects.toBe(repositoryError);
  });
});
