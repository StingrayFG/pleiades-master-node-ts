import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { CONSENSUS_STATE_ID, type ConsensusState } from '@/modules/consensus/consensus.domain';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { ElectionServiceContract } from '@/modules/election/election.service';
import type { MasterNode } from '@/modules/master-nodes/master-node.domain';
import type { MasterNodeServiceContract } from '@/modules/master-nodes/master-node.service';

import type { ElectionConfig } from '../election.config';
import { ElectionLifecycleHandler } from '../lifecycle/election.lifecycle-handler';

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

const selfMasterNode: MasterNode = {
  id: selfMasterNodeId,
  certificateFingerprint: 'aa'.repeat(32),
  sessionId: '00000000-0000-4000-8000-000000000001',
  state: 'active',
  mode: 'serving',
  hostname: 'master-a.internal',
  port: 4410,
  scheme: 'grpcs',
  registeredAt: now,
  lastContactAt: now,
  lastHealthCheckAt: null,
  lastHeartbeatAt: null,
  updatedAt: now,
  revision: 1n
};

const config: ElectionConfig = {
  timeoutMinMs: 5_000,
  timeoutMaxMs: 5_000
};

/* tests */

describe('ElectionLifecycleHandler', () => {
  let consensusService: jest.Mocked<ConsensusServiceContract>;
  let electionService: jest.Mocked<ElectionServiceContract>;
  let masterNodeService: jest.Mocked<MasterNodeServiceContract>;
  let handler: ElectionLifecycleHandler;

  beforeEach(() => {
    consensusService = {
      getConsensusState: jest.fn<ConsensusServiceContract['getConsensusState']>().mockResolvedValue(consensusState)
    } as unknown as jest.Mocked<ConsensusServiceContract>;
    electionService = {
      requestVote: jest.fn<ElectionServiceContract['requestVote']>(),
      runElection: jest.fn<ElectionServiceContract['runElection']>().mockResolvedValue(false)
    };
    masterNodeService = {
      listMasterNodes: jest.fn<MasterNodeServiceContract['listMasterNodes']>().mockResolvedValue([selfMasterNode])
    } as unknown as jest.Mocked<MasterNodeServiceContract>;

    handler = new ElectionLifecycleHandler(
      consensusService,
      electionService,
      masterNodeService,
      selfMasterNodeId,
      config
    );
  });

  test('waits until the randomized election deadline expires', async () => {
    await handler.run(new Date(now.getTime() + 4_999));

    expect(electionService.runElection).not.toHaveBeenCalled();

    await handler.run(new Date(now.getTime() + 5_000));

    expect(electionService.runElection).toHaveBeenCalledWith();
  });

  test('does not run follower election logic while the local master is leader', async () => {
    consensusService.getConsensusState.mockResolvedValue({
      ...consensusState,
      leaderMasterId: selfMasterNodeId,
      votedForMasterId: selfMasterNodeId
    });

    await handler.run(now);

    expect(electionService.runElection).not.toHaveBeenCalled();
  });

  test('does not campaign while the local master is inactive', async () => {
    masterNodeService.listMasterNodes.mockResolvedValue([{ ...selfMasterNode, state: 'offline' }]);

    await handler.run(new Date(now.getTime() + 10_000));

    expect(electionService.runElection).not.toHaveBeenCalled();
  });

  test('does not run follower election logic for an ineligible current leader', async () => {
    consensusService.getConsensusState.mockResolvedValue({
      ...consensusState,
      leaderMasterId: selfMasterNodeId,
      votedForMasterId: selfMasterNodeId
    });
    masterNodeService.listMasterNodes.mockResolvedValue([{ ...selfMasterNode, mode: 'draining' }]);

    await handler.run(now);

    expect(electionService.runElection).not.toHaveBeenCalled();
  });
});
