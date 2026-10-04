import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { GenericInternalServerError } from '@/errors/application.errors';
import { CONSENSUS_STATE_ID, type ConsensusState } from '@/modules/consensus/consensus.domain';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { ElectionLifecycleHandlerContract } from '@/modules/election/lifecycle/election.lifecycle-handler';
import type { LeadershipServiceContract } from '@/modules/leadership/leadership.service';

import { MasterNodeLifecycleHandler } from '../lifecycle/master-node.lifecycle-handler';
import type { MasterNodeTaskReplicationHandlerContract } from '../lifecycle/master-node.task-replication-handler';

/* fixtures */

const now = new Date('2026-01-01T00:00:00.000Z');
const selfMasterNodeId = 'master-node-a';

const consensusState: ConsensusState = {
  id: CONSENSUS_STATE_ID,
  currentEpoch: 2n,
  leaderMasterId: 'master-node-b',
  votedForMasterId: 'master-node-b',
  lastLeaderContactAt: now,
  lastAllocatedSequence: -1n,
  lastMatchedSequence: -1n,
  lastCommittedSequence: -1n,
  lastAppliedSequence: -1n,
  createdAt: now,
  updatedAt: now,
  revision: 1n
};

/* tests */

describe('MasterNodeLifecycleHandler', () => {
  let consensusService: jest.Mocked<ConsensusServiceContract>;
  let leadershipService: jest.Mocked<LeadershipServiceContract>;
  let electionLifecycleHandler: jest.Mocked<ElectionLifecycleHandlerContract>;
  let taskReplicationHandler: jest.Mocked<MasterNodeTaskReplicationHandlerContract>;
  let handler: MasterNodeLifecycleHandler;

  beforeEach(() => {
    consensusService = {
      getConsensusState: jest.fn<ConsensusServiceContract['getConsensusState']>().mockResolvedValue(consensusState)
    } as unknown as jest.Mocked<ConsensusServiceContract>;
    leadershipService = {
      broadcastLeaderHeartbeat: jest.fn<LeadershipServiceContract['broadcastLeaderHeartbeat']>().mockResolvedValue()
    } as unknown as jest.Mocked<LeadershipServiceContract>;
    electionLifecycleHandler = {
      run: jest.fn<ElectionLifecycleHandlerContract['run']>()
    };
    taskReplicationHandler = {
      run: jest.fn<MasterNodeTaskReplicationHandlerContract['run']>()
    };

    handler = new MasterNodeLifecycleHandler(
      consensusService,
      leadershipService,
      electionLifecycleHandler,
      taskReplicationHandler,
      selfMasterNodeId
    );
  });

  test('broadcasts a heartbeat when the local master is leader', async () => {
    consensusService.getConsensusState.mockResolvedValue({
      ...consensusState,
      leaderMasterId: selfMasterNodeId,
      votedForMasterId: selfMasterNodeId
    });

    await handler.run(now);

    expect(leadershipService.broadcastLeaderHeartbeat).toHaveBeenCalledWith(now);
    expect(taskReplicationHandler.run).not.toHaveBeenCalled();
    expect(electionLifecycleHandler.run).not.toHaveBeenCalled();
  });

  test('replicates before checking the election deadline while following another master', async () => {
    const calls: string[] = [];

    taskReplicationHandler.run.mockImplementation(async () => {
      calls.push('replication');
    });
    electionLifecycleHandler.run.mockImplementation(async () => {
      calls.push('election');
    });

    await handler.run(now);

    expect(calls).toEqual(['replication', 'election']);
    expect(electionLifecycleHandler.run).toHaveBeenCalledWith(now);
    expect(leadershipService.broadcastLeaderHeartbeat).not.toHaveBeenCalled();
  });

  test('broadcasts a heartbeat when the follower lifecycle wins an election', async () => {
    consensusService.getConsensusState
      .mockResolvedValueOnce(consensusState)
      .mockResolvedValueOnce({
        ...consensusState,
        leaderMasterId: selfMasterNodeId,
        votedForMasterId: selfMasterNodeId
      });

    await handler.run(now);

    expect(taskReplicationHandler.run).toHaveBeenCalled();
    expect(electionLifecycleHandler.run).toHaveBeenCalledWith(now);
    expect(leadershipService.broadcastLeaderHeartbeat).toHaveBeenCalledWith(now);
  });

  test('checks the election deadline even when follower replication fails', async () => {
    const replicationError = new Error('Replication unavailable');

    taskReplicationHandler.run.mockRejectedValue(replicationError);

    let thrown: unknown;

    try {
      await handler.run(now);
    } catch (err) {
      thrown = err;
    }

    expect(electionLifecycleHandler.run).toHaveBeenCalledWith(now);
    expect(thrown).toBeInstanceOf(GenericInternalServerError);
    expect((thrown as Error).cause).toBeInstanceOf(AggregateError);
    expect(((thrown as Error).cause as AggregateError).errors).toEqual([
      { source: 'replication', error: replicationError }
    ]);
  });

  test('aggregates follower replication and election failures', async () => {
    const replicationError = new Error('Replication unavailable');
    const electionError = new Error('Election unavailable');

    taskReplicationHandler.run.mockRejectedValue(replicationError);
    electionLifecycleHandler.run.mockRejectedValue(electionError);

    let thrown: unknown;

    try {
      await handler.run(now);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(GenericInternalServerError);
    expect((thrown as Error).cause).toBeInstanceOf(AggregateError);
    expect(((thrown as Error).cause as AggregateError).errors).toEqual([
      { source: 'replication', error: replicationError },
      { source: 'election', error: electionError }
    ]);
  });
});
