import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { CONSENSUS_STATE_ID, type ConsensusState } from '@/modules/consensus/consensus.domain';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { MasterNode } from '@/modules/master-nodes/master-node.domain';
import type { MasterNodeGrpcClientContract } from '@/modules/master-nodes/master-node.grpc-client';
import type { MasterNodeServiceContract } from '@/modules/master-nodes/master-node.service';
import type { TaskApplyHandlerContract } from '@/modules/tasks/task.apply-handler';
import type { PersistedTask } from '@/modules/tasks/task.domain';
import type { TaskServiceContract } from '@/modules/tasks/task.service';

import type { LeadershipConfig } from '../leadership.config';
import { LeadershipService } from '../leadership.service';

/* fixtures */

const now = new Date('2026-01-01T00:00:00.000Z');
const selfMasterNodeId = 'master-node-aaaaaaaaaaaa';
const config: LeadershipConfig = {
  quorumLossTimeoutMs: 5_000
};

const consensusState: ConsensusState = {
  id: CONSENSUS_STATE_ID,
  currentEpoch: 2n,
  leaderMasterId: 'master-node-bbbbbbbbbbbb',
  votedForMasterId: 'master-node-bbbbbbbbbbbb',
  lastLeaderContactAt: now,
  lastAllocatedSequence: 4n,
  lastMatchedSequence: 4n,
  lastCommittedSequence: 4n,
  lastAppliedSequence: 4n,
  createdAt: now,
  updatedAt: now,
  revision: 1n
};

const electionState: ConsensusState = {
  ...consensusState,
  currentEpoch: 3n,
  leaderMasterId: null,
  votedForMasterId: selfMasterNodeId,
  lastLeaderContactAt: null,
  revision: 2n
};

const leaderState: ConsensusState = {
  ...electionState,
  leaderMasterId: selfMasterNodeId,
  lastLeaderContactAt: now,
  revision: 3n
};

const createMasterNode = (id: string): MasterNode => ({
  id,
  certificateFingerprint: id === selfMasterNodeId ? 'aa'.repeat(32) : 'bb'.repeat(32),
  sessionId: '00000000-0000-4000-8000-000000000001',
  state: 'active',
  mode: 'serving',
  hostname: `${id}.internal`,
  port: 4410,
  scheme: 'grpcs',
  registeredAt: now,
  lastContactAt: now,
  lastHealthCheckAt: null,
  lastHeartbeatAt: null,
  updatedAt: now,
  revision: 1n
});

const masterNodes = [
  createMasterNode(selfMasterNodeId),
  createMasterNode('master-node-bbbbbbbbbbbb'),
  createMasterNode('master-node-aaaaaaaaaaab')
];

const lastTask: PersistedTask = {
  id: '00000000-0000-4000-8000-000000000001',
  originMasterNodeId: selfMasterNodeId,
  epoch: 2n,
  sequence: 4n,
  type: 'bucket.create',
  executionScope: 'cluster',
  data: {},
  payloadId: null,
  state: 'completed',
  createdAt: now,
  updatedAt: now,
  revision: 1n
};

/* tests */

describe('LeadershipService', () => {
  let consensusService: jest.Mocked<ConsensusServiceContract>;
  let masterNodeService: jest.Mocked<MasterNodeServiceContract>;
  let masterNodeGrpcClient: jest.Mocked<MasterNodeGrpcClientContract>;
  let taskService: jest.Mocked<TaskServiceContract>;
  let taskApplyHandler: jest.Mocked<TaskApplyHandlerContract>;
  let service: LeadershipService;

  beforeEach(() => {
    consensusService = {
      getConsensusState: jest.fn<ConsensusServiceContract['getConsensusState']>().mockResolvedValue(consensusState),
      acceptFollowership: jest.fn<ConsensusServiceContract['acceptFollowership']>().mockResolvedValue({
        ...consensusState,
        currentEpoch: 3n
      }),
      releaseLeadership: jest
        .fn<ConsensusServiceContract['releaseLeadership']>()
        .mockResolvedValue(electionState),
      adoptNewerEpoch: jest.fn<ConsensusServiceContract['adoptNewerEpoch']>().mockImplementation(async (epoch) => ({
        ...electionState,
        currentEpoch: epoch
      })),
      advanceLastCommittedSequence: jest
        .fn<ConsensusServiceContract['advanceLastCommittedSequence']>()
        .mockResolvedValue(leaderState)
    } as unknown as jest.Mocked<ConsensusServiceContract>;

    masterNodeService = {
      listMasterNodes: jest.fn<MasterNodeServiceContract['listMasterNodes']>().mockResolvedValue(masterNodes)
    } as unknown as jest.Mocked<MasterNodeServiceContract>;

    masterNodeGrpcClient = {
      recordLeaderHeartbeat: jest
        .fn<MasterNodeGrpcClientContract['recordLeaderHeartbeat']>()
        .mockResolvedValue({ epoch: 3n, accepted: true, lastMatchedSequence: 4n })
    } as unknown as jest.Mocked<MasterNodeGrpcClientContract>;

    taskService = {
      findTaskBySequence: jest.fn<TaskServiceContract['findTaskBySequence']>().mockResolvedValue(lastTask)
    } as unknown as jest.Mocked<TaskServiceContract>;

    taskApplyHandler = {
      run: jest.fn<TaskApplyHandlerContract['run']>().mockResolvedValue()
    } as unknown as jest.Mocked<TaskApplyHandlerContract>;

    service = new LeadershipService(
      consensusService,
      masterNodeService,
      masterNodeGrpcClient,
      taskService,
      taskApplyHandler,
      selfMasterNodeId,
      config
    );
  });

  test('accepts a current leader heartbeat and refreshes followership', async () => {
    await expect(
      service.recordLeaderHeartbeat({
        leaderMasterNodeId: 'master-node-bbbbbbbbbbbb',
        epoch: 3n,
        lastCommittedSequence: 4n
      })
    ).resolves.toEqual({
      epoch: 3n,
      lastMatchedSequence: 4n,
      accepted: true
    });

    expect(consensusService.acceptFollowership).toHaveBeenCalledWith({
      epoch: 3n,
      leaderMasterId: 'master-node-bbbbbbbbbbbb'
    });
  });

  test('rejects stale leader heartbeats', async () => {
    await expect(
      service.recordLeaderHeartbeat({
        leaderMasterNodeId: 'master-node-bbbbbbbbbbbb',
        epoch: 1n,
        lastCommittedSequence: 4n
      })
    ).resolves.toEqual({
      epoch: consensusState.currentEpoch,
      lastMatchedSequence: consensusState.lastMatchedSequence,
      accepted: false
    });

    expect(consensusService.acceptFollowership).not.toHaveBeenCalled();
  });

  test('steps down when a heartbeat response carries a newer epoch', async () => {
    consensusService.getConsensusState.mockResolvedValue(leaderState);
    masterNodeGrpcClient.recordLeaderHeartbeat
      .mockResolvedValueOnce({ epoch: 4n, accepted: false, lastMatchedSequence: 4n })
      .mockResolvedValueOnce({ epoch: 3n, accepted: true, lastMatchedSequence: 4n });

    await service.broadcastLeaderHeartbeat();

    expect(consensusService.adoptNewerEpoch).toHaveBeenCalledWith(4n);
  });

  test('does not broadcast heartbeats when the local leader is not serving', async () => {
    consensusService.getConsensusState.mockResolvedValue(leaderState);
    masterNodeService.listMasterNodes.mockResolvedValue(
      masterNodes.map((masterNode) =>
        masterNode.id === selfMasterNodeId
          ? {
              ...masterNode,
              mode: 'draining'
            }
          : masterNode
      )
    );

    await service.broadcastLeaderHeartbeat();

    expect(masterNodeGrpcClient.recordLeaderHeartbeat).not.toHaveBeenCalled();
    expect(consensusService.releaseLeadership).toHaveBeenCalledWith({
      epoch: leaderState.currentEpoch,
      leaderMasterId: selfMasterNodeId
    });
  });

  test('retains leadership through a transient heartbeat quorum failure', async () => {
    consensusService.getConsensusState.mockResolvedValue(leaderState);
    masterNodeGrpcClient.recordLeaderHeartbeat.mockResolvedValue({
      epoch: leaderState.currentEpoch,
      accepted: false,
      lastMatchedSequence: 4n
    });

    await service.broadcastLeaderHeartbeat(now);

    expect(consensusService.releaseLeadership).not.toHaveBeenCalled();
  });

  test('releases leadership after heartbeat quorum loss lasts through the timeout', async () => {
    consensusService.getConsensusState.mockResolvedValue(leaderState);
    masterNodeGrpcClient.recordLeaderHeartbeat.mockResolvedValue({
      epoch: leaderState.currentEpoch,
      accepted: false,
      lastMatchedSequence: 4n
    });

    await service.broadcastLeaderHeartbeat(now);
    await service.broadcastLeaderHeartbeat(new Date(now.getTime() + config.quorumLossTimeoutMs));

    expect(consensusService.releaseLeadership).toHaveBeenCalledWith({
      epoch: leaderState.currentEpoch,
      leaderMasterId: selfMasterNodeId
    });
  });

  test('clears a pending quorum-loss timeout after heartbeat quorum is restored', async () => {
    consensusService.getConsensusState.mockResolvedValue(leaderState);
    masterNodeGrpcClient.recordLeaderHeartbeat.mockResolvedValue({
      epoch: leaderState.currentEpoch,
      accepted: false,
      lastMatchedSequence: 4n
    });

    await service.broadcastLeaderHeartbeat(now);

    masterNodeGrpcClient.recordLeaderHeartbeat.mockResolvedValue({
      epoch: leaderState.currentEpoch,
      accepted: true,
      lastMatchedSequence: 4n
    });

    await service.broadcastLeaderHeartbeat(new Date(now.getTime() + config.quorumLossTimeoutMs));

    masterNodeGrpcClient.recordLeaderHeartbeat.mockResolvedValue({
      epoch: leaderState.currentEpoch,
      accepted: false,
      lastMatchedSequence: 4n
    });

    await service.broadcastLeaderHeartbeat(new Date(now.getTime() + config.quorumLossTimeoutMs * 2));

    expect(consensusService.releaseLeadership).not.toHaveBeenCalled();
  });

  test('commits a task sequence once a quorum of voters holds it', async () => {
    consensusService.getConsensusState.mockResolvedValue({
      ...leaderState,
      lastAllocatedSequence: 6n,
      lastCommittedSequence: 4n
    });
    taskService.findTaskBySequence.mockResolvedValue({ ...lastTask, sequence: 6n, epoch: 3n });
    masterNodeGrpcClient.recordLeaderHeartbeat
      .mockResolvedValueOnce({ epoch: 3n, accepted: true, lastMatchedSequence: 6n })
      .mockResolvedValueOnce({ epoch: 3n, accepted: true, lastMatchedSequence: 4n });

    await service.broadcastLeaderHeartbeat();

    expect(consensusService.advanceLastCommittedSequence).toHaveBeenCalledWith({
      leadershipContext: {
        epoch: 3n,
        leaderMasterId: selfMasterNodeId
      },
      sequence: 6n
    });
    expect(taskApplyHandler.run).toHaveBeenCalled();
  });

  test('does not commit a task sequence held by less than a quorum of voters', async () => {
    consensusService.getConsensusState.mockResolvedValue({
      ...leaderState,
      lastAllocatedSequence: 6n,
      lastCommittedSequence: 4n
    });
    masterNodeGrpcClient.recordLeaderHeartbeat.mockResolvedValue({
      epoch: 3n,
      accepted: true,
      lastMatchedSequence: 4n
    });

    await service.broadcastLeaderHeartbeat();

    expect(consensusService.advanceLastCommittedSequence).not.toHaveBeenCalled();
    expect(taskApplyHandler.run).not.toHaveBeenCalled();
  });

  test('does not commit a quorum-held task sequence from an older epoch', async () => {
    consensusService.getConsensusState.mockResolvedValue({
      ...leaderState,
      lastAllocatedSequence: 6n,
      lastCommittedSequence: 4n
    });
    taskService.findTaskBySequence.mockResolvedValue({ ...lastTask, sequence: 6n, epoch: 2n });
    masterNodeGrpcClient.recordLeaderHeartbeat.mockResolvedValue({
      epoch: 3n,
      accepted: true,
      lastMatchedSequence: 6n
    });

    await service.broadcastLeaderHeartbeat();

    expect(consensusService.advanceLastCommittedSequence).not.toHaveBeenCalled();
  });

  test('does not reuse matched sequence progress from an older leadership epoch', async () => {
    let currentState: ConsensusState = {
      ...leaderState,
      lastAllocatedSequence: 6n,
      lastCommittedSequence: 4n
    };

    consensusService.getConsensusState.mockImplementation(async () => currentState);
    taskService.findTaskBySequence
      .mockResolvedValueOnce({ ...lastTask, sequence: 6n, epoch: 2n })
      .mockResolvedValueOnce({ ...lastTask, sequence: 6n, epoch: 4n });
    masterNodeGrpcClient.recordLeaderHeartbeat
      .mockResolvedValueOnce({ epoch: 3n, accepted: false, lastMatchedSequence: 4n })
      .mockResolvedValueOnce({ epoch: 3n, accepted: true, lastMatchedSequence: 6n })
      .mockResolvedValueOnce({ epoch: 4n, accepted: true, lastMatchedSequence: 4n })
      .mockResolvedValueOnce({ epoch: 4n, accepted: false, lastMatchedSequence: 6n });

    await service.broadcastLeaderHeartbeat();

    currentState = {
      ...currentState,
      currentEpoch: 4n,
      revision: 4n
    };

    await service.broadcastLeaderHeartbeat();

    expect(taskService.findTaskBySequence).toHaveBeenCalledTimes(1);
    expect(consensusService.advanceLastCommittedSequence).not.toHaveBeenCalled();
  });

  test('commits immediately when the local node is the only voting member', async () => {
    consensusService.getConsensusState.mockResolvedValue({
      ...leaderState,
      lastAllocatedSequence: 6n,
      lastCommittedSequence: 4n
    });
    masterNodeService.listMasterNodes.mockResolvedValue([createMasterNode(selfMasterNodeId)]);
    taskService.findTaskBySequence.mockResolvedValue({ ...lastTask, sequence: 6n, epoch: 3n });

    await service.evaluateCommitment();

    expect(consensusService.advanceLastCommittedSequence).toHaveBeenCalledWith({
      leadershipContext: {
        epoch: 3n,
        leaderMasterId: selfMasterNodeId
      },
      sequence: 6n
    });
    expect(taskApplyHandler.run).toHaveBeenCalled();
  });

  test('does not evaluate commitment when the local node is not the leader', async () => {
    await service.evaluateCommitment();

    expect(consensusService.advanceLastCommittedSequence).not.toHaveBeenCalled();
    expect(masterNodeService.listMasterNodes).not.toHaveBeenCalled();
  });

  test('does not count matches recorded under a previous epoch', async () => {
    // record matched sequences from both followers under epoch 3; the task at the
    // candidate sequence is from an older epoch, so nothing commits yet
    consensusService.getConsensusState.mockResolvedValue({
      ...leaderState,
      lastAllocatedSequence: 6n,
      lastCommittedSequence: 4n
    });
    masterNodeGrpcClient.recordLeaderHeartbeat.mockResolvedValue({
      epoch: 3n,
      accepted: true,
      lastMatchedSequence: 6n
    });

    await service.broadcastLeaderHeartbeat();

    // the same node leads again in a new epoch; the task at the candidate sequence
    // is now a current-epoch entry, so only the stale matches could commit it
    consensusService.getConsensusState.mockResolvedValue({
      ...leaderState,
      currentEpoch: 4n,
      lastAllocatedSequence: 6n,
      lastCommittedSequence: 4n
    });
    taskService.findTaskBySequence.mockResolvedValue({ ...lastTask, sequence: 6n, epoch: 4n });

    await service.evaluateCommitment();

    expect(consensusService.advanceLastCommittedSequence).not.toHaveBeenCalled();
  });
});
