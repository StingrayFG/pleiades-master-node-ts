import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { GenericConflictError } from '@/errors/application.errors';
import { CONSENSUS_STATE_ID, type ConsensusState } from '@/modules/consensus/consensus.domain';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { RegisterMasterNodeInput } from '@/modules/master-nodes/master-node.application';
import type { MasterNode } from '@/modules/master-nodes/master-node.domain';
import type { MasterNodeServiceContract } from '@/modules/master-nodes/master-node.service';

import { BootstrapService } from '../bootstrap.service';

/* fixtures */

const now = new Date('2026-01-01T00:00:00.000Z');
const selfMasterNodeId = 'master-node-a';
const leaderMasterNodeId = 'master-node-b';
const temporaryLeaderMasterNodeId = 'temporary-leader-master-node-id';
const temporaryLeaderSessionId = '00000000-0000-4000-8000-000000000000';

const selfMasterNode: Omit<RegisterMasterNodeInput, 'state' | 'mode'> = {
  id: selfMasterNodeId,
  certificateFingerprint: 'ab'.repeat(32),
  sessionId: '00000000-0000-4000-8000-000000000001',
  endpoint: {
    hostname: 'master-node-a.internal',
    port: 4410,
    scheme: 'grpcs'
  }
};

const masterNode: MasterNode = {
  ...selfMasterNode,
  state: 'active',
  mode: 'serving',
  hostname: selfMasterNode.endpoint.hostname,
  port: selfMasterNode.endpoint.port,
  scheme: selfMasterNode.endpoint.scheme,
  registeredAt: now,
  lastContactAt: now,
  lastHealthCheckAt: null,
  lastHeartbeatAt: null,
  updatedAt: now,
  revision: 1n
};

const leaderEndpoint = {
  hostname: 'master-node-b.internal',
  port: 4410,
  scheme: 'grpcs' as const
};

const leaderCertificateFingerprint = 'cd'.repeat(32);

const unclaimedState: ConsensusState = {
  id: CONSENSUS_STATE_ID,
  currentEpoch: 2n,
  leaderMasterId: null,
  lastAllocatedSequence: -1n,
  lastCommittedSequence: -1n,
  lastAppliedSequence: -1n,
  createdAt: now,
  updatedAt: now,
  revision: 0n
};

const followerState: ConsensusState = {
  ...unclaimedState,
  leaderMasterId: temporaryLeaderMasterNodeId,
  revision: 1n
};

const followerInput = {
  leaderEndpoint,
  leaderCertificateFingerprint
};

/* mocks */

const createConsensusServiceMock = (): jest.Mocked<ConsensusServiceContract> => {
  return {
    getConsensusState: jest.fn<ConsensusServiceContract['getConsensusState']>().mockResolvedValue(unclaimedState),
    bootstrapLeadership: jest.fn<ConsensusServiceContract['bootstrapLeadership']>(),
    acceptFollowership: jest.fn<ConsensusServiceContract['acceptFollowership']>().mockResolvedValue(followerState)
  } as unknown as jest.Mocked<ConsensusServiceContract>;
};

const createMasterNodeServiceMock = (): jest.Mocked<MasterNodeServiceContract> => {
  return {
    registerMasterNode: jest.fn<MasterNodeServiceContract['registerMasterNode']>().mockResolvedValue(masterNode)
  } as unknown as jest.Mocked<MasterNodeServiceContract>;
};

/* tests */

describe('BootstrapService', () => {
  let consensusService: jest.Mocked<ConsensusServiceContract>;
  let masterNodeService: jest.Mocked<MasterNodeServiceContract>;
  let service: BootstrapService;

  beforeEach(() => {
    consensusService = createConsensusServiceMock();
    masterNodeService = createMasterNodeServiceMock();
    service = new BootstrapService(consensusService, masterNodeService, selfMasterNode);
  });

  test('accepts the temporary leader information and registers both master rows', async () => {
    await expect(service.bootstrapAsFollower(followerInput)).resolves.toEqual({
      role: 'follower',
      epoch: followerState.currentEpoch,
      leaderMasterId: temporaryLeaderMasterNodeId
    });

    expect(masterNodeService.registerMasterNode).toHaveBeenNthCalledWith(1, {
      id: temporaryLeaderMasterNodeId,
      certificateFingerprint: leaderCertificateFingerprint,
      sessionId: temporaryLeaderSessionId,
      state: 'active',
      mode: 'serving',
      endpoint: leaderEndpoint
    });
    expect(masterNodeService.registerMasterNode).toHaveBeenNthCalledWith(2, {
      ...selfMasterNode,
      state: 'joining',
      mode: 'serving'
    });
    expect(consensusService.acceptFollowership).toHaveBeenCalledWith(temporaryLeaderMasterNodeId);
    expect(masterNodeService.registerMasterNode).toHaveBeenNthCalledWith(3, {
      ...selfMasterNode,
      state: 'active',
      mode: 'serving'
    });
    expect(masterNodeService.registerMasterNode.mock.invocationCallOrder[0]).toBeLessThan(
      consensusService.acceptFollowership.mock.invocationCallOrder[0]
    );
  });

  test('rejects leadership when another leader exists before changing the local master row', async () => {
    consensusService.getConsensusState.mockResolvedValue({
      ...unclaimedState,
      leaderMasterId: leaderMasterNodeId
    });

    await expect(service.bootstrapAsLeader()).rejects.toBeInstanceOf(GenericConflictError);
    expect(masterNodeService.registerMasterNode).not.toHaveBeenCalled();
    expect(consensusService.bootstrapLeadership).not.toHaveBeenCalled();
  });

  test('rejects repeated leadership bootstrap before changing the local master row', async () => {
    consensusService.getConsensusState.mockResolvedValue({
      ...unclaimedState,
      leaderMasterId: selfMasterNodeId
    });

    await expect(service.bootstrapAsLeader()).rejects.toMatchObject({
      message: 'This master node is already the cluster leader'
    });
    expect(masterNodeService.registerMasterNode).not.toHaveBeenCalled();
    expect(consensusService.bootstrapLeadership).not.toHaveBeenCalled();
  });

  test('rejects followership when the local master node is already leader', async () => {
    consensusService.getConsensusState.mockResolvedValue({
      ...unclaimedState,
      leaderMasterId: selfMasterNodeId
    });

    await expect(service.bootstrapAsFollower(followerInput)).rejects.toBeInstanceOf(GenericConflictError);
    expect(masterNodeService.registerMasterNode).not.toHaveBeenCalled();
    expect(consensusService.acceptFollowership).not.toHaveBeenCalled();
  });

  test('rejects a different existing leader before changing master node rows', async () => {
    consensusService.getConsensusState.mockResolvedValue({
      ...unclaimedState,
      leaderMasterId: 'master-node-c'
    });

    await expect(service.bootstrapAsFollower(followerInput)).rejects.toBeInstanceOf(GenericConflictError);
    expect(masterNodeService.registerMasterNode).not.toHaveBeenCalled();
    expect(consensusService.acceptFollowership).not.toHaveBeenCalled();
  });

  test('does not accept followership when the leader row cannot be registered', async () => {
    const registrationError = new Error('Master node storage unavailable');

    masterNodeService.registerMasterNode.mockRejectedValueOnce(registrationError);

    await expect(service.bootstrapAsFollower(followerInput)).rejects.toBe(registrationError);
    expect(masterNodeService.registerMasterNode).toHaveBeenCalledTimes(1);
    expect(consensusService.acceptFollowership).not.toHaveBeenCalled();
  });
});
