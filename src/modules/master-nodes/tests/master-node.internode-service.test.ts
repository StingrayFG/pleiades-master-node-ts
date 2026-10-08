import { Buffer } from 'node:buffer';

import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { z } from 'zod';

import type { Prisma } from '@prisma/client';

import {
  GenericConflictError,
  GenericFailedPreconditionError,
  GenericForbiddenError,
  GenericInternalServerError,
  GenericNotFoundError
} from '@/errors/application.errors';
import { CLUSTER_RECORD_ID, type Cluster } from '@/modules/cluster/cluster.domain';
import type { ClusterServiceContract } from '@/modules/cluster/cluster.service';
import type { ConsensusState } from '@/modules/consensus/consensus.domain';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { ElectionServiceContract } from '@/modules/election/election.service';
import type { LeadershipServiceContract } from '@/modules/leadership/leadership.service';
import type { PersistedTask } from '@/modules/tasks/task.domain';
import { createTaskDefinition } from '@/modules/tasks/task.definition';
import type { TaskServiceContract } from '@/modules/tasks/task.service';

import type { MasterNode } from '../master-node.domain';
import { MasterNodeInternodeService } from '../master-node.internode-service';
import type { MasterNodeServiceContract } from '../master-node.service';

/* fixtures */

const now = new Date('2026-01-01T00:00:00.000Z');
const payloadId = '00000000-0000-4000-8000-000000000003';
const selfMasterNodeId = 'master-node-aaaaaaaaaaaa';
const selfMasterNodeSessionId = '00000000-0000-4000-8000-000000000001';
const clusterId = '00000000-0000-4000-8000-000000000010';
const callerMasterNodeId = 'master-node-bbbbbbbbbbbb';
const callerMasterNodeSessionId = '00000000-0000-4000-8000-000000000004';
const callerCertificateFingerprint = 'ab'.repeat(32);

const cluster: Cluster = {
  id: CLUSTER_RECORD_ID,
  clusterId,
  membershipRevision: 2n,
  createdAt: now,
  updatedAt: now
};

const consensusState: ConsensusState = {
  id: 'self',
  currentEpoch: 2n,
  leaderMasterId: selfMasterNodeId,
  votedForMasterId: selfMasterNodeId,
  lastLeaderContactAt: now,
  lastAllocatedSequence: 5n,
  lastMatchedSequence: 4n,
  lastCommittedSequence: 4n,
  lastAppliedSequence: 3n,
  createdAt: now,
  updatedAt: now,
  revision: 2n
};

const task: PersistedTask = {
  id: '00000000-0000-4000-8000-000000000002',
  originMasterNodeId: 'master-node-aaaaaaaaaaaa',
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

const callerMasterNode: MasterNode = {
  id: callerMasterNodeId,
  certificateFingerprint: callerCertificateFingerprint,
  sessionId: callerMasterNodeSessionId,
  state: 'active',
  mode: 'serving',
  hostname: 'follower.internal',
  port: 4410,
  scheme: 'grpcs',
  registeredAt: now,
  lastContactAt: now,
  lastHeartbeatAt: null,
  updatedAt: now,
  revision: 1n
};

const authenticatedCaller = {
  callerMasterNodeId,
  callerMasterNodeSessionId,
  callerCertificateFingerprint
};

const clusterMembershipSnapshot = {
  cluster,
  masterNodes: [callerMasterNode],
  dataNodes: []
};

const resultTaskDefinition = createTaskDefinition({
  type: 'test.result',
  executionScope: 'cluster',
  dataSchema: z.object({ value: z.string() }),
  resultSchema: z.object({ result: z.string() })
});

const voidTaskDefinition = createTaskDefinition({
  type: 'test.void',
  executionScope: 'cluster',
  dataSchema: z.object({ value: z.string() })
});

/* mocks */

const createTaskServiceMock = (): jest.Mocked<TaskServiceContract> => {
  const service = {
    listTasksInSequenceRange: jest.fn<TaskServiceContract['listTasksInSequenceRange']>(),
    retrieveTaskPayload: jest.fn<TaskServiceContract['retrieveTaskPayload']>(),
    getTaskDefinitionByType: jest.fn<TaskServiceContract['getTaskDefinitionByType']>(),
    executeTaskByDefinition: jest.fn<TaskServiceContract['executeTaskByDefinition']>()
  };

  service.listTasksInSequenceRange.mockResolvedValue([task]);
  service.retrieveTaskPayload.mockResolvedValue(Buffer.from('task payload'));
  service.getTaskDefinitionByType.mockReturnValue(resultTaskDefinition);
  service.executeTaskByDefinition.mockResolvedValue({ result: 'done' });

  return service as unknown as jest.Mocked<TaskServiceContract>;
};

const createConsensusServiceMock = (): jest.Mocked<ConsensusServiceContract> => {
  const service = {
    getConsensusState: jest.fn<ConsensusServiceContract['getConsensusState']>(),
    advanceLastCommittedSequence: jest.fn<ConsensusServiceContract['advanceLastCommittedSequence']>(),
    advanceLastAppliedSequence: jest.fn<ConsensusServiceContract['advanceLastAppliedSequence']>(),
    advanceLastAllocatedSequence: jest.fn<ConsensusServiceContract['advanceLastAllocatedSequence']>(),
    withAdvancedLastAllocatedSequence: jest.fn<ConsensusServiceContract['withAdvancedLastAllocatedSequence']>(),
    withLeadershipContext: jest.fn<ConsensusServiceContract['withLeadershipContext']>(),
    claimInitialLeadership: jest.fn<ConsensusServiceContract['claimInitialLeadership']>(),
    acceptFollowership: jest.fn<ConsensusServiceContract['acceptFollowership']>()
  };

  service.getConsensusState.mockResolvedValue(consensusState);
  service.withLeadershipContext.mockImplementation(async (_leadershipContext, action) =>
    action({} as Prisma.TransactionClient)
  );

  return service as unknown as jest.Mocked<ConsensusServiceContract>;
};

const createClusterServiceMock = (): jest.Mocked<ClusterServiceContract> => {
  return {
    getCluster: jest.fn<ClusterServiceContract['getCluster']>().mockResolvedValue(cluster),
    captureMembershipSnapshot: jest
      .fn<ClusterServiceContract['captureMembershipSnapshot']>()
      .mockResolvedValue(clusterMembershipSnapshot),
    initializeCluster: jest.fn<ClusterServiceContract['initializeCluster']>(),
    registerCluster: jest.fn<ClusterServiceContract['registerCluster']>(),
    withAdvancedMembershipRevision: jest.fn<ClusterServiceContract['withAdvancedMembershipRevision']>(),
    applyMembershipSnapshot: jest.fn<ClusterServiceContract['applyMembershipSnapshot']>()
  } as unknown as jest.Mocked<ClusterServiceContract>;
};

const createElectionServiceMock = (): jest.Mocked<ElectionServiceContract> => {
  return {
    requestVote: jest.fn<ElectionServiceContract['requestVote']>().mockResolvedValue({
      epoch: consensusState.currentEpoch,
      voteGranted: false
    }),
    runElection: jest.fn<ElectionServiceContract['runElection']>()
  };
};

const createLeadershipServiceMock = (): jest.Mocked<LeadershipServiceContract> => {
  return {
    recordLeaderHeartbeat: jest.fn<LeadershipServiceContract['recordLeaderHeartbeat']>().mockResolvedValue({
      epoch: consensusState.currentEpoch,
      lastMatchedSequence: consensusState.lastMatchedSequence,
      accepted: true
    })
  } as unknown as jest.Mocked<LeadershipServiceContract>;
};

const createMasterNodeServiceMock = (): jest.Mocked<MasterNodeServiceContract> => {
  return {
    getMasterNodeById: jest.fn<MasterNodeServiceContract['getMasterNodeById']>().mockResolvedValue(callerMasterNode),
    applyMasterNodeHeartbeat: jest.fn<MasterNodeServiceContract['applyMasterNodeHeartbeat']>(),
    registerMasterNode: jest.fn<MasterNodeServiceContract['registerMasterNode']>().mockResolvedValue(callerMasterNode)
  } as unknown as jest.Mocked<MasterNodeServiceContract>;
};

/* tests */

describe('MasterNodeInternodeService', () => {
  let taskService: jest.Mocked<TaskServiceContract>;
  let consensusService: jest.Mocked<ConsensusServiceContract>;
  let electionService: jest.Mocked<ElectionServiceContract>;
  let leadershipService: jest.Mocked<LeadershipServiceContract>;
  let clusterService: jest.Mocked<ClusterServiceContract>;
  let masterNodeService: jest.Mocked<MasterNodeServiceContract>;
  let service: MasterNodeInternodeService;

  beforeEach(() => {
    taskService = createTaskServiceMock();
    consensusService = createConsensusServiceMock();
    electionService = createElectionServiceMock();
    leadershipService = createLeadershipServiceMock();
    clusterService = createClusterServiceMock();
    masterNodeService = createMasterNodeServiceMock();
    service = new MasterNodeInternodeService(
      taskService,
      consensusService,
      electionService,
      leadershipService,
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
        id: callerMasterNodeId,
        certificateFingerprint: callerCertificateFingerprint,
        sessionId: callerMasterNodeSessionId,
        clusterId,
        endpoint: {
          hostname: callerMasterNode.hostname,
          port: callerMasterNode.port,
          scheme: callerMasterNode.scheme
        }
      })
    ).resolves.toBeUndefined();

    expect(masterNodeService.registerMasterNode).toHaveBeenCalledWith(
      {
        id: callerMasterNodeId,
        certificateFingerprint: callerCertificateFingerprint,
        sessionId: callerMasterNodeSessionId,
        state: 'joining',
        mode: 'serving',
        endpoint: {
          hostname: callerMasterNode.hostname,
          port: callerMasterNode.port,
          scheme: callerMasterNode.scheme
        }
      },
      expect.anything()
    );
    expect(consensusService.withLeadershipContext).toHaveBeenCalledWith(
      {
        epoch: consensusState.currentEpoch,
        leaderMasterId: selfMasterNodeId
      },
      expect.any(Function)
    );
  });

  test('delegates authenticated vote requests to the election service', async () => {
    await expect(
      service.requestVote({
        ...authenticatedCaller,
        epoch: 3n,
        lastLogEpoch: 2n,
        lastLogSequence: 4n
      })
    ).resolves.toEqual({
      epoch: consensusState.currentEpoch,
      voteGranted: false
    });

    expect(electionService.requestVote).toHaveBeenCalledWith({
      electionStarterMasterNodeId: callerMasterNodeId,
      epoch: 3n,
      lastLogEpoch: 2n,
      lastLogSequence: 4n
    });
  });

  test('rejects vote requests from a draining election starter', async () => {
    masterNodeService.getMasterNodeById.mockResolvedValue({
      ...callerMasterNode,
      mode: 'draining'
    });

    await expect(
      service.requestVote({
        ...authenticatedCaller,
        epoch: 3n,
        lastLogEpoch: 2n,
        lastLogSequence: 4n
      })
    ).rejects.toBeInstanceOf(GenericFailedPreconditionError);

    expect(electionService.requestVote).not.toHaveBeenCalled();
  });

  test('rejects vote requests from a joining election starter', async () => {
    masterNodeService.getMasterNodeById.mockResolvedValue({
      ...callerMasterNode,
      state: 'joining'
    });

    await expect(
      service.requestVote({
        ...authenticatedCaller,
        epoch: 3n,
        lastLogEpoch: 2n,
        lastLogSequence: 4n
      })
    ).rejects.toBeInstanceOf(GenericFailedPreconditionError);

    expect(electionService.requestVote).not.toHaveBeenCalled();
  });

  test('delegates authenticated leader heartbeats to the leadership service', async () => {
    await expect(
      service.recordLeaderHeartbeat({
        ...authenticatedCaller,
        epoch: 3n,
        lastCommittedSequence: 4n
      })
    ).resolves.toEqual({
      epoch: consensusState.currentEpoch,
      lastMatchedSequence: consensusState.lastMatchedSequence,
      accepted: true
    });

    expect(leadershipService.recordLeaderHeartbeat).toHaveBeenCalledWith({
      leaderMasterNodeId: callerMasterNodeId,
      epoch: 3n,
      lastCommittedSequence: 4n
    });
    expect(masterNodeService.applyMasterNodeHeartbeat).toHaveBeenCalledWith({
      id: callerMasterNode.id,
      sessionId: callerMasterNode.sessionId
    });
  });

  test('accepts a leader heartbeat when the activity stamp fails', async () => {
    masterNodeService.applyMasterNodeHeartbeat.mockRejectedValue(new Error('activity stamp failed'));

    await expect(
      service.recordLeaderHeartbeat({
        ...authenticatedCaller,
        epoch: 3n,
        lastCommittedSequence: 4n
      })
    ).resolves.toEqual({
      epoch: consensusState.currentEpoch,
      lastMatchedSequence: consensusState.lastMatchedSequence,
      accepted: true
    });
  });

  test('does not record a rejected leader heartbeat', async () => {
    leadershipService.recordLeaderHeartbeat.mockResolvedValue({
      epoch: consensusState.currentEpoch,
      lastMatchedSequence: consensusState.lastMatchedSequence,
      accepted: false
    });

    await service.recordLeaderHeartbeat({
      ...authenticatedCaller,
      epoch: 3n,
      lastCommittedSequence: 4n
    });

    expect(masterNodeService.applyMasterNodeHeartbeat).not.toHaveBeenCalled();
  });

  test('rejects leader heartbeats from a draining master node', async () => {
    masterNodeService.getMasterNodeById.mockResolvedValue({
      ...callerMasterNode,
      mode: 'draining'
    });

    await expect(
      service.recordLeaderHeartbeat({
        ...authenticatedCaller,
        epoch: 3n,
        lastCommittedSequence: 4n
      })
    ).rejects.toBeInstanceOf(GenericFailedPreconditionError);

    expect(leadershipService.recordLeaderHeartbeat).not.toHaveBeenCalled();
  });

  test('rejects leader heartbeats from a joining master node', async () => {
    masterNodeService.getMasterNodeById.mockResolvedValue({
      ...callerMasterNode,
      state: 'joining'
    });

    await expect(
      service.recordLeaderHeartbeat({
        ...authenticatedCaller,
        epoch: 3n,
        lastCommittedSequence: 4n
      })
    ).rejects.toBeInstanceOf(GenericFailedPreconditionError);

    expect(leadershipService.recordLeaderHeartbeat).not.toHaveBeenCalled();
  });

  test('rejects a leader heartbeat when the authenticated record does not match the caller id', async () => {
    masterNodeService.getMasterNodeById.mockResolvedValue({
      ...callerMasterNode,
      id: 'master-node-aaaaaaaaaaaa'
    });

    await expect(
      service.recordLeaderHeartbeat({
        ...authenticatedCaller,
        epoch: 3n,
        lastCommittedSequence: 4n
      })
    ).rejects.toBeInstanceOf(GenericForbiddenError);

    expect(leadershipService.recordLeaderHeartbeat).not.toHaveBeenCalled();
  });

  test('rejects registration from a different cluster', async () => {
    await expect(
      service.registerMasterNode({
        id: callerMasterNodeId,
        certificateFingerprint: callerCertificateFingerprint,
        sessionId: callerMasterNodeSessionId,
        clusterId: '00000000-0000-4000-8000-000000000099',
        endpoint: {
          hostname: callerMasterNode.hostname,
          port: callerMasterNode.port,
          scheme: callerMasterNode.scheme
        }
      })
    ).rejects.toBeInstanceOf(GenericConflictError);

    expect(masterNodeService.registerMasterNode).not.toHaveBeenCalled();
  });

  test('fetches task entries in sequence order bounds up to the allocated sequence', async () => {
    await expect(service.fetchTaskEntries({ ...authenticatedCaller, afterSequence: -1n, limit: 32 })).resolves.toEqual({
      epoch: consensusState.currentEpoch,
      lastAllocatedSequence: consensusState.lastAllocatedSequence,
      lastCommittedSequence: consensusState.lastCommittedSequence,
      clusterMembershipRevision: cluster.membershipRevision,
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
    expect(taskService.listTasksInSequenceRange).toHaveBeenCalledWith({
      afterSequence: -1n,
      upToSequence: consensusState.lastAllocatedSequence,
      limit: 32
    });
  });

  test('promotes a caught-up joining follower to an active member', async () => {
    const joiningCaller = { ...callerMasterNode, state: 'joining' as const };
    const promotedCluster = { ...cluster, membershipRevision: cluster.membershipRevision + 1n };

    masterNodeService.getMasterNodeById.mockResolvedValue(joiningCaller);
    clusterService.getCluster.mockResolvedValue(promotedCluster);

    await expect(
      service.fetchTaskEntries({
        ...authenticatedCaller,
        afterSequence: consensusState.lastCommittedSequence,
        limit: 8
      })
    ).resolves.toMatchObject({
      clusterMembershipRevision: promotedCluster.membershipRevision
    });

    expect(masterNodeService.registerMasterNode).toHaveBeenCalledWith(
      {
        id: callerMasterNode.id,
        certificateFingerprint: callerMasterNode.certificateFingerprint,
        sessionId: callerMasterNode.sessionId,
        state: 'active',
        mode: callerMasterNode.mode,
        endpoint: {
          hostname: callerMasterNode.hostname,
          port: callerMasterNode.port,
          scheme: callerMasterNode.scheme
        }
      },
      expect.anything()
    );
    expect(consensusService.withLeadershipContext).toHaveBeenCalledWith(
      {
        epoch: consensusState.currentEpoch,
        leaderMasterId: selfMasterNodeId
      },
      expect.any(Function)
    );
    expect(masterNodeService.registerMasterNode.mock.invocationCallOrder[0]).toBeLessThan(
      clusterService.getCluster.mock.invocationCallOrder[0]
    );
  });

  test('keeps a joining follower behind the committed sequence unmodified', async () => {
    const joiningCaller = { ...callerMasterNode, state: 'joining' as const };

    masterNodeService.getMasterNodeById.mockResolvedValue(joiningCaller);

    await expect(
      service.fetchTaskEntries({ ...authenticatedCaller, afterSequence: 0n, limit: 8 })
    ).resolves.toBeDefined();

    expect(masterNodeService.registerMasterNode).not.toHaveBeenCalled();
  });

  test('returns an empty entry list when no committed tasks are available', async () => {
    taskService.listTasksInSequenceRange.mockResolvedValue([]);

    await expect(service.fetchTaskEntries({ ...authenticatedCaller, afterSequence: 4n, limit: 8 })).resolves.toEqual({
      epoch: consensusState.currentEpoch,
      lastAllocatedSequence: consensusState.lastAllocatedSequence,
      lastCommittedSequence: consensusState.lastCommittedSequence,
      clusterMembershipRevision: cluster.membershipRevision,
      entries: []
    });
  });

  test('returns the cluster membership snapshot to an authenticated master node', async () => {
    await expect(service.fetchClusterMembershipSnapshot(authenticatedCaller)).resolves.toBe(clusterMembershipSnapshot);
    expect(clusterService.captureMembershipSnapshot).toHaveBeenCalledWith();
  });

  test('serves authenticated calls from joining master nodes', async () => {
    masterNodeService.getMasterNodeById.mockResolvedValue({ ...callerMasterNode, state: 'joining' });

    await expect(service.fetchClusterMembershipSnapshot(authenticatedCaller)).resolves.toBe(clusterMembershipSnapshot);
  });

  test('retrieves a task payload from byte storage', async () => {
    const payload = Buffer.from('task payload');

    await expect(service.fetchTaskPayload({ ...authenticatedCaller, payloadId })).resolves.toEqual(payload);
    expect(taskService.retrieveTaskPayload).toHaveBeenCalledWith(payloadId);
  });

  test('executes a forwarded task and encodes its declared result', async () => {
    await expect(
      service.forwardTask({
        ...authenticatedCaller,
        type: resultTaskDefinition.type,
        data: { value: 'input' }
      })
    ).resolves.toEqual({ result: 'done' });

    expect(taskService.getTaskDefinitionByType).toHaveBeenCalledWith(resultTaskDefinition.type);
    expect(taskService.executeTaskByDefinition).toHaveBeenCalledWith(resultTaskDefinition, { value: 'input' });
  });

  test('rejects a missing declared result from forwarded task execution', async () => {
    taskService.executeTaskByDefinition.mockResolvedValue(undefined);

    await expect(
      service.forwardTask({
        ...authenticatedCaller,
        type: resultTaskDefinition.type,
        data: { value: 'input' }
      })
    ).rejects.toBeInstanceOf(GenericInternalServerError);
  });

  test('returns no result for forwarded task execution without a result schema', async () => {
    taskService.getTaskDefinitionByType.mockReturnValue(voidTaskDefinition);
    taskService.executeTaskByDefinition.mockResolvedValue(undefined);

    await expect(
      service.forwardTask({
        ...authenticatedCaller,
        type: voidTaskDefinition.type,
        data: { value: 'input' }
      })
    ).resolves.toBeUndefined();
  });

  test('rejects an unexpected result from forwarded task execution without a result schema', async () => {
    taskService.getTaskDefinitionByType.mockReturnValue(voidTaskDefinition);
    taskService.executeTaskByDefinition.mockResolvedValue({ result: 'unexpected' });

    await expect(
      service.forwardTask({
        ...authenticatedCaller,
        type: voidTaskDefinition.type,
        data: { value: 'input' }
      })
    ).rejects.toBeInstanceOf(GenericInternalServerError);
  });

  test('rejects task history requests from an unregistered master node', async () => {
    masterNodeService.getMasterNodeById.mockRejectedValue(new GenericNotFoundError('Master node not found'));

    await expect(
      service.fetchTaskEntries({ ...authenticatedCaller, afterSequence: -1n, limit: 32 })
    ).rejects.toBeInstanceOf(GenericForbiddenError);

    expect(taskService.listTasksInSequenceRange).not.toHaveBeenCalled();
  });

  test('rejects task payload requests when the presented certificate does not match the caller', async () => {
    await expect(
      service.fetchTaskPayload({
        ...authenticatedCaller,
        callerCertificateFingerprint: 'cd'.repeat(32),
        payloadId
      })
    ).rejects.toBeInstanceOf(GenericForbiddenError);

    expect(taskService.retrieveTaskPayload).not.toHaveBeenCalled();
  });

  test('rejects task history requests from a stale master node session', async () => {
    await expect(
      service.fetchTaskEntries({
        ...authenticatedCaller,
        callerMasterNodeSessionId: '00000000-0000-4000-8000-000000000099',
        afterSequence: -1n,
        limit: 32
      })
    ).rejects.toBeInstanceOf(GenericConflictError);

    expect(taskService.listTasksInSequenceRange).not.toHaveBeenCalled();
  });

  test('rejects master information requests when the local master node is not the leader', async () => {
    consensusService.getConsensusState.mockResolvedValue({
      ...consensusState,
      leaderMasterId: 'master-node-bbbbbbbbbbbb'
    });

    await expect(service.fetchMasterInfo()).rejects.toBeInstanceOf(GenericFailedPreconditionError);
    expect(clusterService.getCluster).not.toHaveBeenCalled();
  });

  test('rejects task entry requests when the local master node is not the leader', async () => {
    consensusService.getConsensusState.mockResolvedValue({
      ...consensusState,
      leaderMasterId: 'master-node-bbbbbbbbbbbb'
    });

    await expect(
      service.fetchTaskEntries({ ...authenticatedCaller, afterSequence: -1n, limit: 32 })
    ).rejects.toBeInstanceOf(GenericFailedPreconditionError);
    expect(taskService.listTasksInSequenceRange).not.toHaveBeenCalled();
  });

  test('rejects task payload requests when the local master node is not the leader', async () => {
    consensusService.getConsensusState.mockResolvedValue({
      ...consensusState,
      leaderMasterId: 'master-node-bbbbbbbbbbbb'
    });

    await expect(service.fetchTaskPayload({ ...authenticatedCaller, payloadId })).rejects.toBeInstanceOf(
      GenericFailedPreconditionError
    );
    expect(taskService.retrieveTaskPayload).not.toHaveBeenCalled();
  });

  test('propagates task service failures', async () => {
    const taskServiceError = new Error('Task storage unavailable');

    taskService.listTasksInSequenceRange.mockRejectedValue(taskServiceError);

    await expect(service.fetchTaskEntries({ ...authenticatedCaller, afterSequence: -1n, limit: 32 })).rejects.toBe(
      taskServiceError
    );
  });
});
