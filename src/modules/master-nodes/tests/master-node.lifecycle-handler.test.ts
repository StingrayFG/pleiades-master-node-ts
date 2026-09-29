import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { GenericInternalServerError } from '@/errors/application.errors';
import { CONSENSUS_STATE_ID, type ConsensusState } from '@/modules/consensus/consensus.domain';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { ElectionServiceContract } from '@/modules/election/election.service';
import type { ElectionLifecycleHandlerContract } from '@/modules/election/lifecycle/election.lifecycle-handler';

import { MasterNodeLifecycleHandler } from '../lifecycle/master-node.lifecycle-handler';
import type { MasterNodeReplicationHandlerContract } from '../master-node.replication-handler';

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
  let electionService: jest.Mocked<ElectionServiceContract>;
  let electionLifecycleHandler: jest.Mocked<ElectionLifecycleHandlerContract>;
  let replicationHandler: jest.Mocked<MasterNodeReplicationHandlerContract>;
  let handler: MasterNodeLifecycleHandler;

  beforeEach(() => {
    consensusService = {
      getConsensusState: jest.fn<ConsensusServiceContract['getConsensusState']>().mockResolvedValue(consensusState)
    } as unknown as jest.Mocked<ConsensusServiceContract>;
    electionService = {
      requestVote: jest.fn<ElectionServiceContract['requestVote']>(),
      recordLeaderHeartbeat: jest.fn<ElectionServiceContract['recordLeaderHeartbeat']>(),
      runElection: jest.fn<ElectionServiceContract['runElection']>(),
      broadcastLeaderHeartbeat: jest.fn<ElectionServiceContract['broadcastLeaderHeartbeat']>(),
      evaluateCommitment: jest.fn<ElectionServiceContract['evaluateCommitment']>().mockResolvedValue()
    };
    electionLifecycleHandler = {
      run: jest.fn<ElectionLifecycleHandlerContract['run']>()
    };
    replicationHandler = {
      run: jest.fn<MasterNodeReplicationHandlerContract['run']>()
    };

    handler = new MasterNodeLifecycleHandler(
      consensusService,
      electionService,
      electionLifecycleHandler,
      replicationHandler,
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

    expect(electionService.broadcastLeaderHeartbeat).toHaveBeenCalledWith(now);
    expect(replicationHandler.run).not.toHaveBeenCalled();
    expect(electionLifecycleHandler.run).not.toHaveBeenCalled();
  });

  test('replicates before checking the election deadline while following another master', async () => {
    const calls: string[] = [];

    replicationHandler.run.mockImplementation(async () => {
      calls.push('replication');
    });
    electionLifecycleHandler.run.mockImplementation(async () => {
      calls.push('election');
    });

    await handler.run(now);

    expect(calls).toEqual(['replication', 'election']);
    expect(electionLifecycleHandler.run).toHaveBeenCalledWith(now);
    expect(electionService.broadcastLeaderHeartbeat).not.toHaveBeenCalled();
  });

  test('checks the election deadline even when follower replication fails', async () => {
    const replicationError = new Error('Replication unavailable');

    replicationHandler.run.mockRejectedValue(replicationError);

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

    replicationHandler.run.mockRejectedValue(replicationError);
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
