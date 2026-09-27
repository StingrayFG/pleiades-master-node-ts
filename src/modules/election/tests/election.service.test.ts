import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { GenericInternalServerError } from '@/errors/application.errors';
import { CONSENSUS_STATE_ID, type ConsensusState } from '@/modules/consensus/consensus.domain';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { MasterNode } from '@/modules/master-nodes/master-node.domain';
import type { MasterNodeGrpcClientContract } from '@/modules/master-nodes/master-node.grpc-client';
import type { MasterNodeServiceContract } from '@/modules/master-nodes/master-node.service';
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
      relinquishLeadership: jest
        .fn<ConsensusServiceContract['relinquishLeadership']>()
        .mockResolvedValue(electionState)
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
        .mockResolvedValue({ epoch: 3n, accepted: true })
    } as unknown as jest.Mocked<MasterNodeGrpcClientContract>;

    taskService = {
      findTaskBySequence: jest.fn<TaskServiceContract['findTaskBySequence']>().mockResolvedValue(lastTask)
    } as unknown as jest.Mocked<TaskServiceContract>;

    service = new ElectionService(
      consensusService,
      masterNodeService,
      masterNodeGrpcClient,
      taskService,
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
      accepted: true
    });

    expect(consensusService.acceptFollowership).toHaveBeenCalledWith('master-node-leader', 3n);
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

    expect(consensusService.completeElection).toHaveBeenCalledWith(selfMasterNodeId, 3n);
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
      .mockResolvedValueOnce({ epoch: 4n, accepted: false })
      .mockResolvedValueOnce({ epoch: 3n, accepted: true });

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
    expect(consensusService.relinquishLeadership).toHaveBeenCalledWith(selfMasterNodeId, leaderState.currentEpoch);
  });

  test('retains leadership through a transient heartbeat quorum failure', async () => {
    consensusService.getConsensusState.mockResolvedValue(leaderState);
    masterNodeGrpcClient.recordLeaderHeartbeat.mockResolvedValue({
      epoch: leaderState.currentEpoch,
      accepted: false
    });

    await service.broadcastLeaderHeartbeat(now);

    expect(consensusService.relinquishLeadership).not.toHaveBeenCalled();
  });

  test('relinquishes leadership after heartbeat quorum loss lasts through the timeout', async () => {
    consensusService.getConsensusState.mockResolvedValue(leaderState);
    masterNodeGrpcClient.recordLeaderHeartbeat.mockResolvedValue({
      epoch: leaderState.currentEpoch,
      accepted: false
    });

    await service.broadcastLeaderHeartbeat(now);
    await service.broadcastLeaderHeartbeat(new Date(now.getTime() + config.timeoutMaxMs));

    expect(consensusService.relinquishLeadership).toHaveBeenCalledWith(selfMasterNodeId, leaderState.currentEpoch);
  });

  test('clears a pending quorum-loss timeout after heartbeat quorum is restored', async () => {
    consensusService.getConsensusState.mockResolvedValue(leaderState);
    masterNodeGrpcClient.recordLeaderHeartbeat.mockResolvedValue({
      epoch: leaderState.currentEpoch,
      accepted: false
    });

    await service.broadcastLeaderHeartbeat(now);

    masterNodeGrpcClient.recordLeaderHeartbeat.mockResolvedValue({
      epoch: leaderState.currentEpoch,
      accepted: true
    });

    await service.broadcastLeaderHeartbeat(new Date(now.getTime() + config.timeoutMaxMs));

    masterNodeGrpcClient.recordLeaderHeartbeat.mockResolvedValue({
      epoch: leaderState.currentEpoch,
      accepted: false
    });

    await service.broadcastLeaderHeartbeat(new Date(now.getTime() + config.timeoutMaxMs * 2));

    expect(consensusService.relinquishLeadership).not.toHaveBeenCalled();
  });

  test('rejects election work when the final local log entry is missing', async () => {
    taskService.findTaskBySequence.mockResolvedValue(null);

    await expect(service.runElection()).rejects.toBeInstanceOf(GenericInternalServerError);
  });
});
