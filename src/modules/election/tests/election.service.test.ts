import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { GenericInternalServerError } from '@/errors/application.errors';
import { CONSENSUS_STATE_ID, type ConsensusState } from '@/modules/consensus/consensus.domain';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { MasterNode } from '@/modules/master-nodes/master-node.domain';
import type { MasterNodeGrpcClientContract } from '@/modules/master-nodes/master-node.grpc-client';
import type { MasterNodeServiceContract } from '@/modules/master-nodes/master-node.service';
import type { TaskApplyHandlerContract } from '@/modules/tasks/task.apply-handler';
import type { PersistedTask } from '@/modules/tasks/task.domain';
import type { TaskServiceContract } from '@/modules/tasks/task.service';

import type { ElectionConfig } from '../election.config';
import { ElectionService } from '../election.service';

/* fixtures */

const now = new Date('2026-01-01T00:00:00.000Z');
const selfMasterNodeId = 'master-node-a';
const config: ElectionConfig = {
  timeoutMinMs: 5_000,
  timeoutMaxMs: 5_000
};

const consensusState: ConsensusState = {
  id: CONSENSUS_STATE_ID,
  currentEpoch: 2n,
  leaderMasterId: 'master-node-leader',
  votedForMasterId: 'master-node-leader',
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
  createMasterNode('master-node-b'),
  createMasterNode('master-node-c')
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

describe('ElectionService', () => {
  let consensusService: jest.Mocked<ConsensusServiceContract>;
  let masterNodeService: jest.Mocked<MasterNodeServiceContract>;
  let masterNodeGrpcClient: jest.Mocked<MasterNodeGrpcClientContract>;
  let taskService: jest.Mocked<TaskServiceContract>;
  let taskApplyHandler: jest.Mocked<TaskApplyHandlerContract>;
  let service: ElectionService;

  beforeEach(() => {
    consensusService = {
      getConsensusState: jest.fn<ConsensusServiceContract['getConsensusState']>().mockResolvedValue(consensusState),
      requestVote: jest.fn<ConsensusServiceContract['requestVote']>().mockResolvedValue({
        state: { ...consensusState, currentEpoch: 3n },
        voteGranted: true
      }),
      startElection: jest.fn<ConsensusServiceContract['startElection']>().mockResolvedValue(electionState),
      completeElection: jest.fn<ConsensusServiceContract['completeElection']>().mockResolvedValue(leaderState),
      observeEpoch: jest.fn<ConsensusServiceContract['observeEpoch']>().mockImplementation(async (epoch) => ({
        ...electionState,
        currentEpoch: epoch
      })),
      acceptFollowership: jest.fn<ConsensusServiceContract['acceptFollowership']>().mockResolvedValue({
        ...consensusState,
        currentEpoch: 3n
      }),
      releaseLeadership: jest
        .fn<ConsensusServiceContract['releaseLeadership']>()
        .mockResolvedValue(electionState),
      advanceLastCommittedSequence: jest
        .fn<ConsensusServiceContract['advanceLastCommittedSequence']>()
        .mockResolvedValue(leaderState)
    } as unknown as jest.Mocked<ConsensusServiceContract>;

    masterNodeService = {
      listMasterNodes: jest.fn<MasterNodeServiceContract['listMasterNodes']>().mockResolvedValue(masterNodes)
    } as unknown as jest.Mocked<MasterNodeServiceContract>;

    masterNodeGrpcClient = {
      requestVote: jest.fn<MasterNodeGrpcClientContract['requestVote']>().mockResolvedValue({
        epoch: 3n,
        voteGranted: true
      }),
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

    service = new ElectionService(
      consensusService,
      masterNodeService,
      masterNodeGrpcClient,
      taskService,
      taskApplyHandler,
      selfMasterNodeId,
      config
    );
  });

  test('grants a vote through durable consensus state after comparing log freshness', async () => {
    await expect(
      service.requestVote({
        candidateMasterNodeId: 'master-node-b',
        epoch: 3n,
        lastLogEpoch: 2n,
        lastLogSequence: 5n
      })
    ).resolves.toEqual({
      epoch: 3n,
      voteGranted: true
    });

    expect(consensusService.requestVote).toHaveBeenCalledWith({
      epoch: 3n,
      candidateMasterNodeId: 'master-node-b',
      candidateLastLogEpoch: 2n,
      candidateLastLogSequence: 5n,
      localLastLogEpoch: lastTask.epoch,
      localLastLogSequence: lastTask.sequence
    });
  });

  test('accepts a current leader heartbeat and refreshes followership', async () => {
    await expect(
      service.recordLeaderHeartbeat({
        leaderMasterNodeId: 'master-node-leader',
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
      leaderMasterId: 'master-node-leader'
    });
  });

  test('rejects stale leader heartbeats', async () => {
    await expect(
      service.recordLeaderHeartbeat({
        leaderMasterNodeId: 'master-node-leader',
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

  test('wins an election after receiving a majority and broadcasts leadership', async () => {
    consensusService.getConsensusState.mockResolvedValue(leaderState);
    masterNodeGrpcClient.requestVote
      .mockResolvedValueOnce({ epoch: 3n, voteGranted: true })
      .mockRejectedValueOnce(new Error('Peer unavailable'));

    await expect(service.runElection()).resolves.toBe(true);

    expect(consensusService.completeElection).toHaveBeenCalledWith(3n, selfMasterNodeId);
    expect(masterNodeGrpcClient.requestVote).toHaveBeenCalledTimes(2);
    expect(masterNodeGrpcClient.recordLeaderHeartbeat).toHaveBeenCalledTimes(2);
  });

  test('does not claim leadership without a majority', async () => {
    masterNodeGrpcClient.requestVote.mockResolvedValue({ epoch: 3n, voteGranted: false });

    await expect(service.runElection()).resolves.toBe(false);

    expect(consensusService.completeElection).not.toHaveBeenCalled();
  });

  test('does not complete an election after the local candidate becomes ineligible', async () => {
    masterNodeService.listMasterNodes
      .mockResolvedValueOnce(masterNodes)
      .mockResolvedValueOnce(
        masterNodes.map((masterNode) =>
          masterNode.id === selfMasterNodeId
            ? {
                ...masterNode,
                mode: 'draining'
              }
            : masterNode
        )
      );

    await expect(service.runElection()).resolves.toBe(false);

    expect(consensusService.completeElection).not.toHaveBeenCalled();
    expect(masterNodeGrpcClient.recordLeaderHeartbeat).not.toHaveBeenCalled();
  });

  test('steps down when a vote response carries a newer epoch', async () => {
    masterNodeGrpcClient.requestVote
      .mockResolvedValueOnce({ epoch: 4n, voteGranted: false })
      .mockResolvedValueOnce({ epoch: 3n, voteGranted: true });

    await expect(service.runElection()).resolves.toBe(false);

    expect(consensusService.observeEpoch).toHaveBeenCalledWith(4n);
    expect(consensusService.completeElection).not.toHaveBeenCalled();
  });

  test('steps down when a heartbeat response carries a newer epoch', async () => {
    consensusService.getConsensusState.mockResolvedValue(leaderState);
    masterNodeGrpcClient.recordLeaderHeartbeat
      .mockResolvedValueOnce({ epoch: 4n, accepted: false, lastMatchedSequence: 4n })
      .mockResolvedValueOnce({ epoch: 3n, accepted: true, lastMatchedSequence: 4n });

    await service.broadcastLeaderHeartbeat();

    expect(consensusService.observeEpoch).toHaveBeenCalledWith(4n);
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
    await service.broadcastLeaderHeartbeat(new Date(now.getTime() + config.timeoutMaxMs));

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

    await service.broadcastLeaderHeartbeat(new Date(now.getTime() + config.timeoutMaxMs));

    masterNodeGrpcClient.recordLeaderHeartbeat.mockResolvedValue({
      epoch: leaderState.currentEpoch,
      accepted: false,
      lastMatchedSequence: 4n
    });

    await service.broadcastLeaderHeartbeat(new Date(now.getTime() + config.timeoutMaxMs * 2));

    expect(consensusService.releaseLeadership).not.toHaveBeenCalled();
  });

  test('rejects election work when the final local log entry is missing', async () => {
    taskService.findTaskBySequence.mockResolvedValue(null);

    await expect(service.runElection()).rejects.toBeInstanceOf(GenericInternalServerError);
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

    expect(consensusService.advanceLastCommittedSequence).toHaveBeenCalledWith(6n, {
      epoch: 3n,
      leaderMasterId: selfMasterNodeId
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

  test('commits immediately when the local node is the only voting member', async () => {
    consensusService.getConsensusState.mockResolvedValue({
      ...leaderState,
      lastAllocatedSequence: 6n,
      lastCommittedSequence: 4n
    });
    masterNodeService.listMasterNodes.mockResolvedValue([createMasterNode(selfMasterNodeId)]);
    taskService.findTaskBySequence.mockResolvedValue({ ...lastTask, sequence: 6n, epoch: 3n });

    await service.evaluateCommitment();

    expect(consensusService.advanceLastCommittedSequence).toHaveBeenCalledWith(6n, {
      epoch: 3n,
      leaderMasterId: selfMasterNodeId
    });
    expect(taskApplyHandler.run).toHaveBeenCalled();
  });

  test('does not evaluate commitment when the local node is not the leader', async () => {
    await service.evaluateCommitment();

    expect(consensusService.advanceLastCommittedSequence).not.toHaveBeenCalled();
    expect(masterNodeService.listMasterNodes).not.toHaveBeenCalled();
  });
});
