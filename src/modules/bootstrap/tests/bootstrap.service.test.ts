import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { GenericConflictError } from '@/errors/application.errors';
import { CLUSTER_RECORD_ID, type Cluster } from '@/modules/cluster/cluster.domain';
import type { ClusterServiceContract } from '@/modules/cluster/cluster.service';
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
  createdAt: now,
  updatedAt: now
};
const selfMasterNodeId = 'master-node-a';
const leaderMasterNodeId = 'master-node-b';
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
  lastAllocatedSequence: -1n,
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
  revision: 1n
};

const leaderState: ConsensusState = {
  ...unclaimedState,
  currentEpoch: 3n,
  leaderMasterId: selfMasterNodeId,
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
    initializeCluster: jest.fn<ClusterServiceContract['initializeCluster']>().mockResolvedValue(cluster),
    registerCluster: jest.fn<ClusterServiceContract['registerCluster']>().mockResolvedValue(cluster)
  };
};

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

const createMasterNodeGrpcClientMock = (): jest.Mocked<MasterNodeGrpcClientContract> => {
  return {
    fetchMasterInfo: jest.fn<MasterNodeGrpcClientContract['fetchMasterInfo']>().mockResolvedValue(leaderInfo),
    registerMasterNode: jest.fn<MasterNodeGrpcClientContract['registerMasterNode']>().mockResolvedValue(),
    fetchTaskEntries: jest.fn<MasterNodeGrpcClientContract['fetchTaskEntries']>(),
    fetchTaskPayload: jest.fn<MasterNodeGrpcClientContract['fetchTaskPayload']>(),
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
    consensusService.bootstrapLeadership.mockResolvedValue(leaderState);

    await expect(service.bootstrapAsLeader()).resolves.toEqual({
      role: 'leader',
      epoch: leaderState.currentEpoch,
      leaderMasterId: selfMasterNodeId
    });

    expect(clusterService.initializeCluster).toHaveBeenCalledWith();
    expect(clusterService.initializeCluster.mock.invocationCallOrder[0]).toBeLessThan(
      masterNodeService.registerMasterNode.mock.invocationCallOrder[0]
    );
    expect(consensusService.bootstrapLeadership).toHaveBeenCalledWith(selfMasterNodeId);
  });

  test('fetches the leader information and registers the cluster and both master rows', async () => {
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
    expect(masterNodeService.registerMasterNode).toHaveBeenNthCalledWith(1, {
      id: leaderMasterNodeId,
      certificateFingerprint: leaderCertificateFingerprint,
      sessionId: leaderMasterNodeSessionId,
      state: 'active',
      mode: 'serving',
      endpoint: leaderEndpoint
    });
    expect(masterNodeService.registerMasterNode).toHaveBeenNthCalledWith(2, {
      ...selfMasterNode,
      state: 'joining',
      mode: 'serving'
    });
    expect(masterNodeGrpcClient.registerMasterNode).toHaveBeenCalledWith({
      masterNodeEndpoint: leaderEndpoint,
      expectedCertificateFingerprint: leaderCertificateFingerprint,
      id: selfMasterNode.id,
      sessionId: selfMasterNode.sessionId,
      clusterId: cluster.clusterId,
      endpoint: selfMasterNode.endpoint
    });
    expect(consensusService.acceptFollowership).toHaveBeenCalledWith(leaderMasterNodeId, leaderInfo.epoch);
    expect(masterNodeService.registerMasterNode).toHaveBeenNthCalledWith(3, {
      ...selfMasterNode,
      state: 'active',
      mode: 'serving'
    });
    expect(masterNodeService.registerMasterNode.mock.invocationCallOrder[0]).toBeLessThan(
      consensusService.acceptFollowership.mock.invocationCallOrder[0]
    );
    expect(masterNodeGrpcClient.registerMasterNode.mock.invocationCallOrder[0]).toBeLessThan(
      consensusService.acceptFollowership.mock.invocationCallOrder[0]
    );
    expect(clusterService.registerCluster.mock.invocationCallOrder[0]).toBeLessThan(
      masterNodeService.registerMasterNode.mock.invocationCallOrder[0]
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
    expect(clusterService.initializeCluster).not.toHaveBeenCalled();
    expect(masterNodeService.registerMasterNode).not.toHaveBeenCalled();
    expect(consensusService.bootstrapLeadership).not.toHaveBeenCalled();
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
      leaderMasterId: 'master-node-c'
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

  test('does not accept followership when the leader row cannot be registered', async () => {
    const registrationError = new Error('Master node storage unavailable');

    masterNodeService.registerMasterNode.mockRejectedValueOnce(registrationError);

    await expect(service.bootstrapAsFollower(followerInput)).rejects.toBe(registrationError);
    expect(clusterService.registerCluster).toHaveBeenCalledWith(cluster.clusterId);
    expect(masterNodeService.registerMasterNode).toHaveBeenCalledTimes(1);
    expect(consensusService.acceptFollowership).not.toHaveBeenCalled();
  });

  test('does not accept followership when leader-side registration fails', async () => {
    const registrationError = new Error('Leader rejected master node registration');

    masterNodeGrpcClient.registerMasterNode.mockRejectedValue(registrationError);

    await expect(service.bootstrapAsFollower(followerInput)).rejects.toBe(registrationError);
    expect(masterNodeService.registerMasterNode).toHaveBeenCalledTimes(2);
    expect(consensusService.acceptFollowership).not.toHaveBeenCalled();
  });
});
