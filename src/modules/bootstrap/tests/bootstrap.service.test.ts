import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { GenericConflictError } from '@/errors/application.errors';
import { CLUSTER_RECORD_ID, type Cluster } from '@/modules/cluster/cluster.domain';
import type { ClusterServiceContract } from '@/modules/cluster/cluster.service';
import type { ClusterMembershipSnapshot } from '@/modules/cluster/cluster.membership-snapshot';
import { CONSENSUS_STATE_ID, type ConsensusState } from '@/modules/consensus/consensus.domain';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type {
  FetchMasterInfoInternodeResult,
  RegisterMasterNodeInput
} from '@/modules/master-nodes/master-node.application';
import type { MasterNode } from '@/modules/master-nodes/master-node.domain';
import type { MasterNodeGrpcClientContract } from '@/modules/master-nodes/master-node.grpc-client';
import type { MasterNodeServiceContract } from '@/modules/master-nodes/master-node.service';

import { BootstrapService } from '../bootstrap.service';

/* fixtures */

const now = new Date('2026-01-01T00:00:00.000Z');
const cluster: Cluster = {
  id: CLUSTER_RECORD_ID,
  clusterId: '00000000-0000-4000-8000-000000000010',
  membershipRevision: 1n,
  createdAt: now,
  updatedAt: now
};
const selfMasterNodeId = 'master-node-aaaaaaaaaaaa';
const leaderMasterNodeId = 'master-node-bbbbbbbbbbbb';
const leaderMasterNodeSessionId = '00000000-0000-4000-8000-000000000002';

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

const leaderMasterNode: MasterNode = {
  id: leaderMasterNodeId,
  certificateFingerprint: leaderCertificateFingerprint,
  sessionId: leaderMasterNodeSessionId,
  state: 'active',
  mode: 'serving',
  hostname: leaderEndpoint.hostname,
  port: leaderEndpoint.port,
  scheme: leaderEndpoint.scheme,
  registeredAt: now,
  lastContactAt: now,
  lastHealthCheckAt: null,
  lastHeartbeatAt: null,
  updatedAt: now,
  revision: 1n
};

const clusterMembershipSnapshot: ClusterMembershipSnapshot = {
  cluster,
  masterNodes: [leaderMasterNode, masterNode],
  dataNodes: []
};

const leaderInfo: FetchMasterInfoInternodeResult = {
  masterId: leaderMasterNodeId,
  sessionId: leaderMasterNodeSessionId,
  clusterId: cluster.clusterId,
  epoch: 4n
};

const unclaimedState: ConsensusState = {
  id: CONSENSUS_STATE_ID,
  currentEpoch: 2n,
  leaderMasterId: null,
  votedForMasterId: null,
  lastLeaderContactAt: null,
  lastAllocatedSequence: -1n,
  lastMatchedSequence: -1n,
  lastCommittedSequence: -1n,
  lastAppliedSequence: -1n,
  createdAt: now,
  updatedAt: now,
  revision: 0n
};

const followerState: ConsensusState = {
  ...unclaimedState,
  currentEpoch: leaderInfo.epoch,
  leaderMasterId: leaderMasterNodeId,
  votedForMasterId: leaderMasterNodeId,
  lastLeaderContactAt: now,
  revision: 1n
};

const leaderState: ConsensusState = {
  ...unclaimedState,
  currentEpoch: 3n,
  leaderMasterId: selfMasterNodeId,
  votedForMasterId: selfMasterNodeId,
  lastLeaderContactAt: now,
  revision: 1n
};

const followerInput = {
  leaderEndpoint,
  leaderCertificateFingerprint
};

/* mocks */

const createClusterServiceMock = (): jest.Mocked<ClusterServiceContract> => {
  return {
    getCluster: jest.fn<ClusterServiceContract['getCluster']>().mockResolvedValue(cluster),
    captureMembershipSnapshot: jest
      .fn<ClusterServiceContract['captureMembershipSnapshot']>()
      .mockResolvedValue(clusterMembershipSnapshot),
    initializeCluster: jest.fn<ClusterServiceContract['initializeCluster']>().mockResolvedValue(cluster),
    registerCluster: jest.fn<ClusterServiceContract['registerCluster']>().mockResolvedValue(cluster),
    withAdvancedMembershipRevision: jest.fn<ClusterServiceContract['withAdvancedMembershipRevision']>(),
    applyMembershipSnapshot: jest.fn<ClusterServiceContract['applyMembershipSnapshot']>().mockResolvedValue()
  } as unknown as jest.Mocked<ClusterServiceContract>;
};

const createConsensusServiceMock = (): jest.Mocked<ConsensusServiceContract> => {
  return {
    getConsensusState: jest.fn<ConsensusServiceContract['getConsensusState']>().mockResolvedValue(unclaimedState),
    claimInitialLeadership: jest.fn<ConsensusServiceContract['claimInitialLeadership']>(),
    acceptFollowership: jest.fn<ConsensusServiceContract['acceptFollowership']>().mockResolvedValue(followerState)
  } as unknown as jest.Mocked<ConsensusServiceContract>;
};

const createMasterNodeServiceMock = (): jest.Mocked<MasterNodeServiceContract> => {
  return {
    registerMasterNode: jest.fn<MasterNodeServiceContract['registerMasterNode']>().mockResolvedValue(masterNode)
  } as unknown as jest.Mocked<MasterNodeServiceContract>;
};

const createMasterNodeGrpcClientMock = (): jest.Mocked<MasterNodeGrpcClientContract> => {
  return {
    fetchMasterInfo: jest.fn<MasterNodeGrpcClientContract['fetchMasterInfo']>().mockResolvedValue(leaderInfo),
    registerMasterNode: jest.fn<MasterNodeGrpcClientContract['registerMasterNode']>().mockResolvedValue(),
    fetchClusterMembershipSnapshot: jest
      .fn<MasterNodeGrpcClientContract['fetchClusterMembershipSnapshot']>()
      .mockResolvedValue(clusterMembershipSnapshot),
    fetchTaskEntries: jest.fn<MasterNodeGrpcClientContract['fetchTaskEntries']>(),
    fetchTaskPayload: jest.fn<MasterNodeGrpcClientContract['fetchTaskPayload']>(),
    forwardTask: jest.fn<MasterNodeGrpcClientContract['forwardTask']>(),
    requestVote: jest.fn<MasterNodeGrpcClientContract['requestVote']>(),
    recordLeaderHeartbeat: jest.fn<MasterNodeGrpcClientContract['recordLeaderHeartbeat']>(),
    close: jest.fn<MasterNodeGrpcClientContract['close']>()
  };
};

/* tests */

describe('BootstrapService', () => {
  let clusterService: jest.Mocked<ClusterServiceContract>;
  let consensusService: jest.Mocked<ConsensusServiceContract>;
  let masterNodeService: jest.Mocked<MasterNodeServiceContract>;
  let masterNodeGrpcClient: jest.Mocked<MasterNodeGrpcClientContract>;
  let service: BootstrapService;

  beforeEach(() => {
    clusterService = createClusterServiceMock();
    consensusService = createConsensusServiceMock();
    masterNodeService = createMasterNodeServiceMock();
    masterNodeGrpcClient = createMasterNodeGrpcClientMock();
    service = new BootstrapService(
      clusterService,
      consensusService,
      masterNodeService,
      masterNodeGrpcClient,
      selfMasterNode
    );
  });

  test('initializes the cluster before claiming leadership', async () => {
    consensusService.claimInitialLeadership.mockResolvedValue(leaderState);

    await expect(service.bootstrapAsLeader()).resolves.toEqual({
      role: 'leader',
      epoch: leaderState.currentEpoch,
      leaderMasterId: selfMasterNodeId
    });

    expect(clusterService.initializeCluster).toHaveBeenCalledWith();
    expect(clusterService.initializeCluster.mock.invocationCallOrder[0]).toBeLessThan(
      masterNodeService.registerMasterNode.mock.invocationCallOrder[0]
    );
    expect(consensusService.claimInitialLeadership).toHaveBeenCalledWith(selfMasterNodeId);
  });

  test('registers with the leader and installs its authenticated cluster membership snapshot', async () => {
    await expect(service.bootstrapAsFollower(followerInput)).resolves.toEqual({
      role: 'follower',
      epoch: followerState.currentEpoch,
      leaderMasterId: leaderMasterNodeId
    });

    expect(masterNodeGrpcClient.fetchMasterInfo).toHaveBeenCalledWith({
      masterNodeEndpoint: leaderEndpoint,
      expectedCertificateFingerprint: leaderCertificateFingerprint
    });
    expect(clusterService.registerCluster).toHaveBeenCalledWith(cluster.clusterId);
    expect(masterNodeGrpcClient.registerMasterNode).toHaveBeenCalledWith({
      masterNodeEndpoint: leaderEndpoint,
      expectedCertificateFingerprint: leaderCertificateFingerprint,
      id: selfMasterNode.id,
      sessionId: selfMasterNode.sessionId,
      clusterId: cluster.clusterId,
      endpoint: selfMasterNode.endpoint
    });
    expect(masterNodeGrpcClient.fetchClusterMembershipSnapshot).toHaveBeenCalledWith({
      masterNodeEndpoint: leaderEndpoint,
      expectedCertificateFingerprint: leaderCertificateFingerprint
    });
    expect(clusterService.applyMembershipSnapshot).toHaveBeenCalledWith(clusterMembershipSnapshot);
    expect(consensusService.acceptFollowership).toHaveBeenCalledWith({
      epoch: leaderInfo.epoch,
      leaderMasterId: leaderMasterNodeId
    });
    expect(masterNodeGrpcClient.registerMasterNode.mock.invocationCallOrder[0]).toBeLessThan(
      masterNodeGrpcClient.fetchClusterMembershipSnapshot.mock.invocationCallOrder[0]
    );
    expect(clusterService.applyMembershipSnapshot.mock.invocationCallOrder[0]).toBeLessThan(
      consensusService.acceptFollowership.mock.invocationCallOrder[0]
    );
  });

  test('rejects leadership when another leader exists before changing the local master row', async () => {
    consensusService.getConsensusState.mockResolvedValue({
      ...unclaimedState,
      leaderMasterId: leaderMasterNodeId
    });

    await expect(service.bootstrapAsLeader()).rejects.toBeInstanceOf(GenericConflictError);
    expect(clusterService.initializeCluster).not.toHaveBeenCalled();
    expect(masterNodeService.registerMasterNode).not.toHaveBeenCalled();
    expect(consensusService.claimInitialLeadership).not.toHaveBeenCalled();
  });

  test('rejects repeated leadership bootstrap before changing the local master row', async () => {
    consensusService.getConsensusState.mockResolvedValue({
      ...unclaimedState,
      leaderMasterId: selfMasterNodeId
    });

    await expect(service.bootstrapAsLeader()).rejects.toMatchObject({
      message: 'This master node is already the cluster leader'
    });
    expect(clusterService.initializeCluster).not.toHaveBeenCalled();
    expect(masterNodeService.registerMasterNode).not.toHaveBeenCalled();
    expect(consensusService.claimInitialLeadership).not.toHaveBeenCalled();
  });

  test('rejects followership when the local master node is already leader', async () => {
    consensusService.getConsensusState.mockResolvedValue({
      ...unclaimedState,
      leaderMasterId: selfMasterNodeId
    });

    await expect(service.bootstrapAsFollower(followerInput)).rejects.toBeInstanceOf(GenericConflictError);
    expect(masterNodeGrpcClient.fetchMasterInfo).not.toHaveBeenCalled();
    expect(masterNodeService.registerMasterNode).not.toHaveBeenCalled();
    expect(consensusService.acceptFollowership).not.toHaveBeenCalled();
  });

  test('rejects a different existing leader before changing master node rows', async () => {
    consensusService.getConsensusState.mockResolvedValue({
      ...unclaimedState,
      leaderMasterId: 'master-node-aaaaaaaaaaab'
    });

    await expect(service.bootstrapAsFollower(followerInput)).rejects.toBeInstanceOf(GenericConflictError);
    expect(masterNodeGrpcClient.fetchMasterInfo).toHaveBeenCalled();
    expect(clusterService.registerCluster).not.toHaveBeenCalled();
    expect(masterNodeService.registerMasterNode).not.toHaveBeenCalled();
    expect(consensusService.acceptFollowership).not.toHaveBeenCalled();
  });

  test('does not persist leader information when certificate verification fails', async () => {
    const certificateError = new Error('Leader certificate fingerprint does not match');

    masterNodeGrpcClient.fetchMasterInfo.mockRejectedValue(certificateError);

    await expect(service.bootstrapAsFollower(followerInput)).rejects.toBe(certificateError);
    expect(clusterService.registerCluster).not.toHaveBeenCalled();
    expect(masterNodeService.registerMasterNode).not.toHaveBeenCalled();
    expect(consensusService.acceptFollowership).not.toHaveBeenCalled();
  });

  test('does not accept followership when leader-side registration fails', async () => {
    const registrationError = new Error('Leader rejected master node registration');

    masterNodeGrpcClient.registerMasterNode.mockRejectedValue(registrationError);

    await expect(service.bootstrapAsFollower(followerInput)).rejects.toBe(registrationError);
    expect(masterNodeGrpcClient.fetchClusterMembershipSnapshot).not.toHaveBeenCalled();
    expect(consensusService.acceptFollowership).not.toHaveBeenCalled();
  });

  test('does not accept followership when the membership snapshot does not contain the registered local node', async () => {
    masterNodeGrpcClient.fetchClusterMembershipSnapshot.mockResolvedValue({
      ...clusterMembershipSnapshot,
      masterNodes: [leaderMasterNode]
    });

    await expect(service.bootstrapAsFollower(followerInput)).rejects.toBeInstanceOf(GenericConflictError);
    expect(clusterService.applyMembershipSnapshot).not.toHaveBeenCalled();
    expect(consensusService.acceptFollowership).not.toHaveBeenCalled();
  });
});
