import { Buffer } from 'node:buffer';

import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
  GenericAbortedError,
  GenericConflictError,
  GenericFailedPreconditionError
} from '@/errors/application.errors';
import { CONSENSUS_STATE_ID, type ConsensusState } from '@/modules/consensus/consensus.domain';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { PersistedTask } from '@/modules/tasks/task.domain';
import type { TaskServiceContract } from '@/modules/tasks/task.service';

import type { InternodeTaskEntry } from '../master-node.application';
import type { MasterNodeConfig } from '../master-node.config';
import type { MasterNode } from '../master-node.domain';
import type { MasterNodeGrpcClientContract } from '../master-node.grpc-client';
import type { MasterNodeServiceContract } from '../master-node.service';
import type { MasterNodeClusterSynchronizationHandlerContract } from '../lifecycle/master-node.cluster-synchronization-handler';
import { MasterNodeTaskReplicationHandler } from '../lifecycle/master-node.task-replication-handler';

/* fixtures */

const now = new Date('2026-01-01T00:00:00.000Z');
const selfMasterNodeId = 'master-node-bbbbbbbbbbbb';
const leaderMasterNodeId = 'master-node-aaaaaaaaaaaa';
const leaderCertificateFingerprint = 'ab'.repeat(32);
const payloadId = '00000000-0000-4000-8000-000000000002';
const clusterMembershipRevision = 2n;

const consensusState: ConsensusState = {
  id: CONSENSUS_STATE_ID,
  currentEpoch: 2n,
  leaderMasterId: leaderMasterNodeId,
  votedForMasterId: leaderMasterNodeId,
  lastLeaderContactAt: now,
  lastAllocatedSequence: -1n,
  lastMatchedSequence: -1n,
  lastCommittedSequence: -1n,
  lastAppliedSequence: -1n,
  createdAt: now,
  updatedAt: now,
  revision: 1n
};

const replicatedLeadershipContext = {
  epoch: 3n,
  leaderMasterId: leaderMasterNodeId
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
    registerMasterNode: jest.fn<MasterNodeGrpcClientContract['registerMasterNode']>(),
    fetchClusterMembershipSnapshot: jest.fn<MasterNodeGrpcClientContract['fetchClusterMembershipSnapshot']>(),
    fetchTaskEntries: jest.fn<MasterNodeGrpcClientContract['fetchTaskEntries']>().mockResolvedValue({
      epoch: 3n,
      lastAllocatedSequence: 0n,
      lastCommittedSequence: 0n,
      clusterMembershipRevision,
      entries: [entry]
    }),
    fetchTaskPayload: jest
      .fn<MasterNodeGrpcClientContract['fetchTaskPayload']>()
      .mockResolvedValue(Buffer.from('payload')),
    forwardTask: jest.fn<MasterNodeGrpcClientContract['forwardTask']>(),
    requestVote: jest.fn<MasterNodeGrpcClientContract['requestVote']>(),
    recordLeaderHeartbeat: jest.fn<MasterNodeGrpcClientContract['recordLeaderHeartbeat']>(),
    close: jest.fn<MasterNodeGrpcClientContract['close']>()
  };
};

const createClusterSynchronizationHandlerMock = (): jest.Mocked<MasterNodeClusterSynchronizationHandlerContract> => {
  return {
    synchronize: jest.fn<MasterNodeClusterSynchronizationHandlerContract['synchronize']>()
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
    advanceLastMatchedSequence: jest
      .fn<ConsensusServiceContract['advanceLastMatchedSequence']>()
      .mockResolvedValue(consensusState),
    advanceLastCommittedSequence: jest
      .fn<ConsensusServiceContract['advanceLastCommittedSequence']>()
      .mockResolvedValue(consensusState)
  } as unknown as jest.Mocked<ConsensusServiceContract>;
};

/* tests */

describe('MasterNodeTaskReplicationHandler', () => {
  let masterNodeGrpcClient: jest.Mocked<MasterNodeGrpcClientContract>;
  let masterNodeService: jest.Mocked<MasterNodeServiceContract>;
  let taskService: jest.Mocked<TaskServiceContract>;
  let consensusService: jest.Mocked<ConsensusServiceContract>;
  let clusterSynchronizationHandler: jest.Mocked<MasterNodeClusterSynchronizationHandlerContract>;
  let handler: MasterNodeTaskReplicationHandler;

  beforeEach(() => {
    masterNodeGrpcClient = createMasterNodeGrpcClientMock();
    masterNodeService = createMasterNodeServiceMock();
    taskService = createTaskServiceMock();
    consensusService = createConsensusServiceMock();
    clusterSynchronizationHandler = createClusterSynchronizationHandlerMock();
    handler = new MasterNodeTaskReplicationHandler(
      masterNodeGrpcClient,
      masterNodeService,
      taskService,
      consensusService,
      clusterSynchronizationHandler,
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
    expect(consensusService.acceptFollowership).toHaveBeenCalledWith({
      epoch: 3n,
      leaderMasterId: leaderMasterNodeId
    });
    expect(masterNodeGrpcClient.fetchTaskPayload).toHaveBeenCalledWith({
      masterNodeEndpoint: expectedMasterNodeEndpoint,
      expectedCertificateFingerprint: leaderCertificateFingerprint,
      payloadId
    });
    expect(taskService.replicateTask).toHaveBeenCalledWith(
      {
        ...entry,
        payload: Buffer.from('payload')
      },
      replicatedLeadershipContext
    );
    expect(consensusService.advanceLastCommittedSequence).toHaveBeenCalledWith({
      leadershipContext: replicatedLeadershipContext,
      sequence: 0n
    });
    expect(consensusService.advanceLastMatchedSequence).toHaveBeenCalledWith({
      leadershipContext: replicatedLeadershipContext,
      sequence: 0n
    });
    expect(consensusService.acceptFollowership.mock.invocationCallOrder[0]).toBeLessThan(
      taskService.replicateTask.mock.invocationCallOrder[0]
    );
  });

  test('continues task replication after the last matched sequence', async () => {
    const nextEntry: InternodeTaskEntry = {
      ...entry,
      id: '00000000-0000-4000-8000-000000000004',
      sequence: 1n,
      payloadId: null
    };
    const matchedConsensusState: ConsensusState = {
      ...consensusState,
      currentEpoch: 3n,
      lastAllocatedSequence: 0n,
      lastMatchedSequence: 0n
    };

    consensusService.getConsensusState.mockResolvedValue(matchedConsensusState);
    consensusService.acceptFollowership.mockResolvedValue(matchedConsensusState);
    masterNodeGrpcClient.fetchTaskEntries.mockResolvedValue({
      epoch: 3n,
      lastAllocatedSequence: 1n,
      lastCommittedSequence: -1n,
      clusterMembershipRevision,
      entries: [nextEntry]
    });

    await expect(handler.run()).resolves.toBeUndefined();

    expect(masterNodeGrpcClient.fetchTaskEntries).toHaveBeenCalledWith({
      masterNodeEndpoint: {
        hostname: leader.hostname,
        port: leader.port,
        scheme: leader.scheme
      },
      expectedCertificateFingerprint: leaderCertificateFingerprint,
      afterSequence: matchedConsensusState.lastMatchedSequence,
      limit: config.replication.batchSize
    });
    expect(taskService.replicateTask).toHaveBeenCalledWith(
      {
        ...nextEntry,
        payload: undefined
      },
      replicatedLeadershipContext
    );
    expect(consensusService.advanceLastMatchedSequence).toHaveBeenCalledWith({
      leadershipContext: replicatedLeadershipContext,
      sequence: nextEntry.sequence
    });
  });

  test('defers fetched entries when a newer leader epoch resets matched progress', async () => {
    const previousEpochConsensusState: ConsensusState = {
      ...consensusState,
      lastAllocatedSequence: 0n,
      lastMatchedSequence: 0n
    };

    consensusService.getConsensusState.mockResolvedValue(previousEpochConsensusState);
    consensusService.acceptFollowership.mockResolvedValue({
      ...previousEpochConsensusState,
      currentEpoch: 3n,
      lastMatchedSequence: previousEpochConsensusState.lastCommittedSequence
    });
    masterNodeGrpcClient.fetchTaskEntries.mockResolvedValue({
      epoch: 3n,
      lastAllocatedSequence: 1n,
      lastCommittedSequence: -1n,
      clusterMembershipRevision,
      entries: [{ ...entry, sequence: 1n }]
    });

    await expect(handler.run()).resolves.toBeUndefined();

    expect(masterNodeGrpcClient.fetchTaskEntries).toHaveBeenCalledWith(
      expect.objectContaining({
        afterSequence: previousEpochConsensusState.lastMatchedSequence
      })
    );
    expect(taskService.replicateTask).not.toHaveBeenCalled();
    expect(consensusService.advanceLastMatchedSequence).not.toHaveBeenCalled();
  });

  test('rejects a fetched batch when consensus advances before replication begins', async () => {
    consensusService.acceptFollowership.mockResolvedValue({
      ...consensusState,
      currentEpoch: 4n
    });

    await expect(handler.run()).rejects.toBeInstanceOf(GenericAbortedError);

    expect(taskService.replicateTask).not.toHaveBeenCalled();
    expect(taskService.deleteTasksFromSequence).not.toHaveBeenCalled();
    expect(consensusService.advanceLastCommittedSequence).not.toHaveBeenCalled();
  });

  test('synchronizes cluster membership before accepting followership', async () => {
    masterNodeGrpcClient.fetchTaskEntries.mockResolvedValue({
      epoch: 3n,
      lastAllocatedSequence: -1n,
      lastCommittedSequence: -1n,
      clusterMembershipRevision: 3n,
      entries: []
    });

    await expect(handler.run()).resolves.toBeUndefined();

    expect(clusterSynchronizationHandler.synchronize).toHaveBeenCalledWith({
      masterNodeEndpoint: {
        hostname: leader.hostname,
        port: leader.port,
        scheme: leader.scheme
      },
      expectedCertificateFingerprint: leader.certificateFingerprint,
      leaderMembershipRevision: 3n
    });
    expect(clusterSynchronizationHandler.synchronize.mock.invocationCallOrder[0]).toBeLessThan(
      consensusService.acceptFollowership.mock.invocationCallOrder[0]
    );
  });

  test('rejects task replication from a stale leader epoch', async () => {
    masterNodeGrpcClient.fetchTaskEntries.mockResolvedValue({
      epoch: 1n,
      lastAllocatedSequence: 0n,
      lastCommittedSequence: 0n,
      clusterMembershipRevision,
      entries: [entry]
    });

    await expect(handler.run()).rejects.toBeInstanceOf(GenericFailedPreconditionError);
    expect(consensusService.acceptFollowership).not.toHaveBeenCalled();
    expect(taskService.replicateTask).not.toHaveBeenCalled();
    expect(consensusService.advanceLastCommittedSequence).not.toHaveBeenCalled();
  });

  test('rejects task entries beyond the leader allocated sequence', async () => {
    masterNodeGrpcClient.fetchTaskEntries.mockResolvedValue({
      epoch: 3n,
      lastAllocatedSequence: -1n,
      lastCommittedSequence: -1n,
      clusterMembershipRevision,
      entries: [entry]
    });

    await expect(handler.run()).rejects.toBeInstanceOf(GenericFailedPreconditionError);

    expect(consensusService.acceptFollowership).not.toHaveBeenCalled();
    expect(taskService.replicateTask).not.toHaveBeenCalled();
  });

  test('tolerates a leader committed sequence behind the local committed history', async () => {
    consensusService.getConsensusState.mockResolvedValue({
      ...consensusState,
      lastAllocatedSequence: 0n,
      lastCommittedSequence: 0n
    });
    masterNodeGrpcClient.fetchTaskEntries.mockResolvedValue({
      epoch: 3n,
      lastAllocatedSequence: 0n,
      lastCommittedSequence: -1n,
      clusterMembershipRevision,
      entries: []
    });

    await expect(handler.run()).resolves.toBeUndefined();

    expect(consensusService.acceptFollowership).toHaveBeenCalled();
    expect(consensusService.advanceLastCommittedSequence).not.toHaveBeenCalled();
  });

  test('only commits through the entries returned in the current batch', async () => {
    masterNodeGrpcClient.fetchTaskEntries.mockResolvedValue({
      epoch: 3n,
      lastAllocatedSequence: 4n,
      lastCommittedSequence: 4n,
      clusterMembershipRevision,
      entries: [entry]
    });

    await expect(handler.run()).resolves.toBeUndefined();

    expect(consensusService.advanceLastCommittedSequence).toHaveBeenCalledWith({
      leadershipContext: replicatedLeadershipContext,
      sequence: entry.sequence
    });
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
      lastAllocatedSequence: 1n,
      lastCommittedSequence: 1n,
      clusterMembershipRevision,
      entries: [entry, nextEntry]
    });
    taskService.replicateTask
      .mockRejectedValueOnce(new GenericConflictError('Task history diverged'))
      .mockResolvedValueOnce(persistedTask)
      .mockResolvedValueOnce({ ...persistedTask, ...nextEntry });

    await expect(handler.run()).resolves.toBeUndefined();

    expect(taskService.deleteTasksFromSequence).toHaveBeenCalledWith(entry.sequence, replicatedLeadershipContext);
    expect(taskService.replicateTask).toHaveBeenCalledTimes(3);
    expect(consensusService.advanceLastCommittedSequence).toHaveBeenCalledWith({
      leadershipContext: replicatedLeadershipContext,
      sequence: nextEntry.sequence
    });
  });

  test('rejects non-contiguous task entries without advancing committed history', async () => {
    masterNodeGrpcClient.fetchTaskEntries.mockResolvedValue({
      epoch: 3n,
      lastAllocatedSequence: 1n,
      lastCommittedSequence: 1n,
      clusterMembershipRevision,
      entries: [{ ...entry, sequence: 1n }]
    });

    await expect(handler.run()).rejects.toBeInstanceOf(GenericFailedPreconditionError);

    expect(taskService.replicateTask).not.toHaveBeenCalled();
    expect(consensusService.advanceLastCommittedSequence).not.toHaveBeenCalled();
  });

  test('replicates uncommitted task entries without advancing the committed sequence', async () => {
    masterNodeGrpcClient.fetchTaskEntries.mockResolvedValue({
      epoch: 3n,
      lastAllocatedSequence: 0n,
      lastCommittedSequence: -1n,
      clusterMembershipRevision,
      entries: [entry]
    });

    await expect(handler.run()).resolves.toBeUndefined();

    expect(taskService.replicateTask).toHaveBeenCalledWith(
      {
        ...entry,
        payload: Buffer.from('payload')
      },
      replicatedLeadershipContext
    );
    expect(taskService.deleteTasksFromSequence).not.toHaveBeenCalled();
    expect(consensusService.advanceLastCommittedSequence).not.toHaveBeenCalled();
    expect(consensusService.advanceLastMatchedSequence).toHaveBeenCalledWith({
      leadershipContext: replicatedLeadershipContext,
      sequence: 0n
    });
  });

  test('removes a stale local tail after reaching the leader allocated sequence', async () => {
    consensusService.getConsensusState.mockResolvedValue({
      ...consensusState,
      lastAllocatedSequence: 1n
    });
    masterNodeGrpcClient.fetchTaskEntries.mockResolvedValue({
      epoch: 3n,
      lastAllocatedSequence: 0n,
      lastCommittedSequence: -1n,
      clusterMembershipRevision,
      entries: [entry]
    });

    await expect(handler.run()).resolves.toBeUndefined();

    expect(taskService.deleteTasksFromSequence).toHaveBeenCalledWith(1n, replicatedLeadershipContext);
    expect(consensusService.advanceLastCommittedSequence).not.toHaveBeenCalled();
  });
});
