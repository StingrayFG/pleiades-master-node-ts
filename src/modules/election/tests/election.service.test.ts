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
const selfMasterNodeId = 'master-node-aaaaaaaaaaaa';
const config: ElectionConfig = {
  timeoutMinMs: 5_000,
  timeoutMaxMs: 5_000
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
      adoptNewerEpoch: jest.fn<ConsensusServiceContract['adoptNewerEpoch']>().mockImplementation(async (epoch) => ({
        ...electionState,
        currentEpoch: epoch
      }))
    } as unknown as jest.Mocked<ConsensusServiceContract>;

    masterNodeService = {
      listMasterNodes: jest.fn<MasterNodeServiceContract['listMasterNodes']>().mockResolvedValue(masterNodes)
    } as unknown as jest.Mocked<MasterNodeServiceContract>;

    masterNodeGrpcClient = {
      requestVote: jest.fn<MasterNodeGrpcClientContract['requestVote']>().mockResolvedValue({
        epoch: 3n,
        voteGranted: true
      })
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
        electionStarterMasterNodeId: 'master-node-bbbbbbbbbbbb',
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
      electionStarterMasterNodeId: 'master-node-bbbbbbbbbbbb',
      electionStarterLastLogEpoch: 2n,
      electionStarterLastLogSequence: 5n,
      localLastLogEpoch: lastTask.epoch,
      localLastLogSequence: lastTask.sequence
    });
  });

  test('wins an election after receiving a majority', async () => {
    consensusService.getConsensusState.mockResolvedValue(leaderState);
    masterNodeGrpcClient.requestVote
      .mockResolvedValueOnce({ epoch: 3n, voteGranted: true })
      .mockRejectedValueOnce(new Error('Peer unavailable'));

    await expect(service.runElection()).resolves.toBe(true);

    expect(consensusService.completeElection).toHaveBeenCalledWith(3n, selfMasterNodeId);
    expect(masterNodeGrpcClient.requestVote).toHaveBeenCalledTimes(2);
  });

  test('does not claim leadership without a majority', async () => {
    masterNodeGrpcClient.requestVote.mockResolvedValue({ epoch: 3n, voteGranted: false });

    await expect(service.runElection()).resolves.toBe(false);

    expect(consensusService.completeElection).not.toHaveBeenCalled();
  });

  test('does not complete an election after the election starter becomes ineligible', async () => {
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
  });

  test('steps down when a vote response carries a newer epoch', async () => {
    masterNodeGrpcClient.requestVote
      .mockResolvedValueOnce({ epoch: 4n, voteGranted: false })
      .mockResolvedValueOnce({ epoch: 3n, voteGranted: true });

    await expect(service.runElection()).resolves.toBe(false);

    expect(consensusService.adoptNewerEpoch).toHaveBeenCalledWith(4n);
    expect(consensusService.completeElection).not.toHaveBeenCalled();
  });

  test('rejects election work when the final local log entry is missing', async () => {
    taskService.findTaskBySequence.mockResolvedValue(null);

    await expect(service.runElection()).rejects.toBeInstanceOf(GenericInternalServerError);
  });
});
