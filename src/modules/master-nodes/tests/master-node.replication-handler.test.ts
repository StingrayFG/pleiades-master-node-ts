import { Buffer } from 'node:buffer';

import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { GenericConflictError, GenericFailedPreconditionError } from '@/errors/application.errors';
import { CONSENSUS_STATE_ID, type ConsensusState } from '@/modules/consensus/consensus.domain';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { PersistedTask } from '@/modules/tasks/task.domain';
import type { TaskServiceContract } from '@/modules/tasks/task.service';

import type { InternodeTaskEntry } from '../master-node.application';
import type { MasterNodeConfig } from '../master-node.config';
import type { MasterNode } from '../master-node.domain';
import type { MasterNodeGrpcClientContract } from '../master-node.grpc-client';
import { MasterNodeReplicationHandler } from '../master-node.replication-handler';
import type { MasterNodeServiceContract } from '../master-node.service';

/* fixtures */

const now = new Date('2026-01-01T00:00:00.000Z');
const selfMasterNodeId = 'master-node-follower';
const leaderMasterNodeId = 'master-node-leader';
const leaderCertificateFingerprint = 'ab'.repeat(32);
const payloadId = '00000000-0000-4000-8000-000000000002';

const consensusState: ConsensusState = {
  id: CONSENSUS_STATE_ID,
  currentEpoch: 2n,
  leaderMasterId: leaderMasterNodeId,
  lastAllocatedSequence: -1n,
  lastCommittedSequence: -1n,
  lastAppliedSequence: -1n,
  createdAt: now,
  updatedAt: now,
  revision: 1n
};

const leader: MasterNode = {
  id: leaderMasterNodeId,
  certificateFingerprint: leaderCertificateFingerprint,
  sessionId: '00000000-0000-4000-8000-000000000001',
  state: 'active',
  mode: 'serving',
  hostname: 'leader.internal',
  port: 4410,
  scheme: 'grpcs',
  registeredAt: now,
  lastContactAt: now,
  lastHealthCheckAt: null,
  lastHeartbeatAt: null,
  updatedAt: now,
  revision: 1n
};

const entry: InternodeTaskEntry = {
  id: '00000000-0000-4000-8000-000000000003',
  originMasterNodeId: leaderMasterNodeId,
  epoch: 3n,
  sequence: 0n,
  type: 'bucket.create',
  executionScope: 'cluster',
  data: { bucketName: 'test-bucket' },
  payloadId,
  createdAt: now
};

const persistedTask: PersistedTask = {
  ...entry,
  state: 'pending',
  revision: 0n,
  updatedAt: now
};

const config: MasterNodeConfig = {
  replication: {
    batchSize: 32
  }
};

/* mocks */

const createMasterNodeGrpcClientMock = (): jest.Mocked<MasterNodeGrpcClientContract> => {
  return {
    fetchMasterInfo: jest.fn<MasterNodeGrpcClientContract['fetchMasterInfo']>(),
    fetchTaskEntries: jest.fn<MasterNodeGrpcClientContract['fetchTaskEntries']>().mockResolvedValue({
      epoch: 3n,
      lastCommittedSequence: 0n,
      entries: [entry]
    }),
    fetchTaskPayload: jest
      .fn<MasterNodeGrpcClientContract['fetchTaskPayload']>()
      .mockResolvedValue(Buffer.from('payload')),
    close: jest.fn<MasterNodeGrpcClientContract['close']>()
  };
};

const createMasterNodeServiceMock = (): jest.Mocked<MasterNodeServiceContract> => {
  return {
    getMasterNodeById: jest.fn<MasterNodeServiceContract['getMasterNodeById']>().mockResolvedValue(leader)
  } as unknown as jest.Mocked<MasterNodeServiceContract>;
};

const createTaskServiceMock = (): jest.Mocked<TaskServiceContract> => {
  return {
    replicateTask: jest.fn<TaskServiceContract['replicateTask']>().mockResolvedValue(persistedTask),
    deleteTasksFromSequence: jest.fn<TaskServiceContract['deleteTasksFromSequence']>().mockResolvedValue(1)
  } as unknown as jest.Mocked<TaskServiceContract>;
};

const createConsensusServiceMock = (): jest.Mocked<ConsensusServiceContract> => {
  return {
    getConsensusState: jest.fn<ConsensusServiceContract['getConsensusState']>().mockResolvedValue(consensusState),
    acceptFollowership: jest
      .fn<ConsensusServiceContract['acceptFollowership']>()
      .mockResolvedValue({ ...consensusState, currentEpoch: 3n }),
    advanceLastAllocatedSequence: jest
      .fn<ConsensusServiceContract['advanceLastAllocatedSequence']>()
      .mockResolvedValue(consensusState),
    advanceLastCommittedSequence: jest
      .fn<ConsensusServiceContract['advanceLastCommittedSequence']>()
      .mockResolvedValue(consensusState)
  } as unknown as jest.Mocked<ConsensusServiceContract>;
};

/* tests */

describe('MasterNodeReplicationHandler', () => {
  let masterNodeGrpcClient: jest.Mocked<MasterNodeGrpcClientContract>;
  let masterNodeService: jest.Mocked<MasterNodeServiceContract>;
  let taskService: jest.Mocked<TaskServiceContract>;
  let consensusService: jest.Mocked<ConsensusServiceContract>;
  let handler: MasterNodeReplicationHandler;

  beforeEach(() => {
    masterNodeGrpcClient = createMasterNodeGrpcClientMock();
    masterNodeService = createMasterNodeServiceMock();
    taskService = createTaskServiceMock();
    consensusService = createConsensusServiceMock();
    handler = new MasterNodeReplicationHandler(
      masterNodeGrpcClient,
      masterNodeService,
      taskService,
      consensusService,
      selfMasterNodeId,
      config
    );
  });

  test('adopts the leader epoch and pins replication calls to its certificate', async () => {
    await expect(handler.run()).resolves.toBeUndefined();

    const expectedMasterNodeEndpoint = {
      hostname: leader.hostname,
      port: leader.port,
      scheme: leader.scheme
    };

    expect(masterNodeGrpcClient.fetchTaskEntries).toHaveBeenCalledWith({
      masterNodeEndpoint: expectedMasterNodeEndpoint,
      expectedCertificateFingerprint: leaderCertificateFingerprint,
      afterSequence: consensusState.lastCommittedSequence,
      limit: config.replication.batchSize
    });
    expect(consensusService.acceptFollowership).toHaveBeenCalledWith(leaderMasterNodeId, 3n);
    expect(masterNodeGrpcClient.fetchTaskPayload).toHaveBeenCalledWith({
      masterNodeEndpoint: expectedMasterNodeEndpoint,
      expectedCertificateFingerprint: leaderCertificateFingerprint,
      payloadId
    });
    expect(taskService.replicateTask).toHaveBeenCalledWith({
      ...entry,
      payload: Buffer.from('payload')
    });
    expect(consensusService.advanceLastCommittedSequence).toHaveBeenCalledWith(0n);
    expect(consensusService.acceptFollowership.mock.invocationCallOrder[0]).toBeLessThan(
      taskService.replicateTask.mock.invocationCallOrder[0]
    );
  });

  test('rejects task replication from a stale leader epoch', async () => {
    masterNodeGrpcClient.fetchTaskEntries.mockResolvedValue({
      epoch: 1n,
      lastCommittedSequence: 0n,
      entries: [entry]
    });

    await expect(handler.run()).rejects.toBeInstanceOf(GenericFailedPreconditionError);
    expect(consensusService.acceptFollowership).not.toHaveBeenCalled();
    expect(taskService.replicateTask).not.toHaveBeenCalled();
    expect(consensusService.advanceLastCommittedSequence).not.toHaveBeenCalled();
  });

  test('rejects a leader committed sequence that regresses local committed history', async () => {
    consensusService.getConsensusState.mockResolvedValue({
      ...consensusState,
      lastAllocatedSequence: 0n,
      lastCommittedSequence: 0n
    });
    masterNodeGrpcClient.fetchTaskEntries.mockResolvedValue({
      epoch: 3n,
      lastCommittedSequence: -1n,
      entries: []
    });

    await expect(handler.run()).rejects.toBeInstanceOf(GenericFailedPreconditionError);

    expect(consensusService.acceptFollowership).not.toHaveBeenCalled();
    expect(taskService.replicateTask).not.toHaveBeenCalled();
  });

  test('only commits through the entries returned in the current batch', async () => {
    masterNodeGrpcClient.fetchTaskEntries.mockResolvedValue({
      epoch: 3n,
      lastCommittedSequence: 4n,
      entries: [entry]
    });

    await expect(handler.run()).resolves.toBeUndefined();

    expect(consensusService.advanceLastCommittedSequence).toHaveBeenCalledWith(entry.sequence);
    expect(taskService.deleteTasksFromSequence).not.toHaveBeenCalled();
  });

  test('rewinds a divergent uncommitted tail and retries the leader entry', async () => {
    const nextEntry: InternodeTaskEntry = {
      ...entry,
      id: '00000000-0000-4000-8000-000000000004',
      sequence: 1n,
      payloadId: null
    };

    consensusService.getConsensusState.mockResolvedValue({
      ...consensusState,
      lastAllocatedSequence: 1n
    });
    masterNodeGrpcClient.fetchTaskEntries.mockResolvedValue({
      epoch: 3n,
      lastCommittedSequence: 1n,
      entries: [entry, nextEntry]
    });
    taskService.replicateTask
      .mockRejectedValueOnce(new GenericConflictError('Task history diverged'))
      .mockResolvedValueOnce(persistedTask)
      .mockResolvedValueOnce({ ...persistedTask, ...nextEntry });

    await expect(handler.run()).resolves.toBeUndefined();

    expect(taskService.deleteTasksFromSequence).toHaveBeenCalledWith(entry.sequence);
    expect(taskService.replicateTask).toHaveBeenCalledTimes(3);
    expect(consensusService.advanceLastCommittedSequence).toHaveBeenCalledWith(nextEntry.sequence);
  });

  test('rejects non-contiguous task entries without advancing committed history', async () => {
    masterNodeGrpcClient.fetchTaskEntries.mockResolvedValue({
      epoch: 3n,
      lastCommittedSequence: 1n,
      entries: [{ ...entry, sequence: 1n }]
    });

    await expect(handler.run()).rejects.toBeInstanceOf(GenericFailedPreconditionError);

    expect(taskService.replicateTask).not.toHaveBeenCalled();
    expect(consensusService.advanceLastCommittedSequence).not.toHaveBeenCalled();
  });

  test('rejects task entries beyond the leader committed sequence', async () => {
    masterNodeGrpcClient.fetchTaskEntries.mockResolvedValue({
      epoch: 3n,
      lastCommittedSequence: -1n,
      entries: [entry]
    });

    await expect(handler.run()).rejects.toBeInstanceOf(GenericFailedPreconditionError);

    expect(taskService.replicateTask).not.toHaveBeenCalled();
    expect(consensusService.advanceLastCommittedSequence).not.toHaveBeenCalled();
  });

  test('removes a stale local tail after fully catching up with the leader', async () => {
    consensusService.getConsensusState.mockResolvedValue({
      ...consensusState,
      lastAllocatedSequence: 1n
    });
    masterNodeGrpcClient.fetchTaskEntries.mockResolvedValue({
      epoch: 3n,
      lastCommittedSequence: -1n,
      entries: []
    });

    await expect(handler.run()).resolves.toBeUndefined();

    expect(taskService.deleteTasksFromSequence).toHaveBeenCalledWith(0n);
    expect(consensusService.advanceLastCommittedSequence).not.toHaveBeenCalled();
  });
});
