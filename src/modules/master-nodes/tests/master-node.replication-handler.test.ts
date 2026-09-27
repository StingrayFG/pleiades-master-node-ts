import { Buffer } from 'node:buffer';

import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { GenericConflictError, GenericFailedPreconditionError } from '@/errors/application.errors';
import { CLUSTER_RECORD_ID, type Cluster } from '@/modules/cluster/cluster.domain';
import type { ClusterServiceContract } from '@/modules/cluster/cluster.service';
import type { ClusterMembershipSnapshot } from '@/modules/cluster/cluster.membership-snapshot';
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

const cluster: Cluster = {
  id: CLUSTER_RECORD_ID,
  clusterId: '00000000-0000-4000-8000-000000000010',
  membershipRevision: 2n,
  createdAt: now,
  updatedAt: now
};

const consensusState: ConsensusState = {
  id: CONSENSUS_STATE_ID,
  currentEpoch: 2n,
  leaderMasterId: leaderMasterNodeId,
  votedForMasterId: leaderMasterNodeId,
  lastLeaderContactAt: now,
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

const updatedClusterMembershipSnapshot: ClusterMembershipSnapshot = {
  cluster: {
    ...cluster,
    membershipRevision: 3n
  },
  masterNodes: [leader]
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
    fetchClusterMembershipSnapshot: jest
      .fn<MasterNodeGrpcClientContract['fetchClusterMembershipSnapshot']>()
      .mockResolvedValue(updatedClusterMembershipSnapshot),
    fetchTaskEntries: jest.fn<MasterNodeGrpcClientContract['fetchTaskEntries']>().mockResolvedValue({
      epoch: 3n,
      lastCommittedSequence: 0n,
      clusterMembershipRevision: cluster.membershipRevision,
      entries: [entry]
    }),
    fetchTaskPayload: jest
      .fn<MasterNodeGrpcClientContract['fetchTaskPayload']>()
      .mockResolvedValue(Buffer.from('payload')),
    close: jest.fn<MasterNodeGrpcClientContract['close']>()
  };
};

const createClusterServiceMock = (): jest.Mocked<ClusterServiceContract> => {
  return {
    getCluster: jest.fn<ClusterServiceContract['getCluster']>().mockResolvedValue(cluster),
    captureMembershipSnapshot: jest.fn<ClusterServiceContract['captureMembershipSnapshot']>(),
    initializeCluster: jest.fn<ClusterServiceContract['initializeCluster']>(),
    registerCluster: jest.fn<ClusterServiceContract['registerCluster']>(),
    advanceMembershipRevision: jest.fn<ClusterServiceContract['advanceMembershipRevision']>(),
    applyMembershipSnapshot: jest.fn<ClusterServiceContract['applyMembershipSnapshot']>()
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
  let clusterService: jest.Mocked<ClusterServiceContract>;
  let handler: MasterNodeReplicationHandler;

  beforeEach(() => {
    masterNodeGrpcClient = createMasterNodeGrpcClientMock();
    masterNodeService = createMasterNodeServiceMock();
    taskService = createTaskServiceMock();
    consensusService = createConsensusServiceMock();
    clusterService = createClusterServiceMock();
    handler = new MasterNodeReplicationHandler(
      masterNodeGrpcClient,
      masterNodeService,
      taskService,
      consensusService,
      clusterService,
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

  test('installs a newer master membership snapshot before accepting followership', async () => {
    masterNodeGrpcClient.fetchTaskEntries.mockResolvedValue({
      epoch: 3n,
      lastCommittedSequence: -1n,
      clusterMembershipRevision: updatedClusterMembershipSnapshot.cluster.membershipRevision,
      entries: []
    });

    await expect(handler.run()).resolves.toBeUndefined();

    expect(masterNodeGrpcClient.fetchClusterMembershipSnapshot).toHaveBeenCalledWith({
      masterNodeEndpoint: {
        hostname: leader.hostname,
        port: leader.port,
        scheme: leader.scheme
      },
      expectedCertificateFingerprint: leader.certificateFingerprint
    });
    expect(clusterService.applyMembershipSnapshot).toHaveBeenCalledWith(updatedClusterMembershipSnapshot);
    expect(clusterService.applyMembershipSnapshot.mock.invocationCallOrder[0]).toBeLessThan(
      consensusService.acceptFollowership.mock.invocationCallOrder[0]
    );
  });

  test('rejects task replication from a stale leader epoch', async () => {
    masterNodeGrpcClient.fetchTaskEntries.mockResolvedValue({
      epoch: 1n,
      lastCommittedSequence: 0n,
      clusterMembershipRevision: cluster.membershipRevision,
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
      clusterMembershipRevision: cluster.membershipRevision,
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
      clusterMembershipRevision: cluster.membershipRevision,
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
      clusterMembershipRevision: cluster.membershipRevision,
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
      clusterMembershipRevision: cluster.membershipRevision,
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
      clusterMembershipRevision: cluster.membershipRevision,
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
      clusterMembershipRevision: cluster.membershipRevision,
      entries: []
    });

    await expect(handler.run()).resolves.toBeUndefined();

    expect(taskService.deleteTasksFromSequence).toHaveBeenCalledWith(0n);
    expect(consensusService.advanceLastCommittedSequence).not.toHaveBeenCalled();
  });
});
