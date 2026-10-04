import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { GenericFailedPreconditionError } from '@/errors/application.errors';
import { CLUSTER_RECORD_ID, type Cluster } from '@/modules/cluster/cluster.domain';
import type { ClusterMembershipSnapshot } from '@/modules/cluster/cluster.membership-snapshot';
import type { ClusterServiceContract } from '@/modules/cluster/cluster.service';

import type { MasterNodeEndpoint } from '../master-node.domain';
import type { MasterNodeGrpcClientContract } from '../master-node.grpc-client';
import { MasterNodeClusterSynchronizationHandler } from '../lifecycle/master-node.cluster-synchronization-handler';

/* fixtures */

const now = new Date('2026-01-01T00:00:00.000Z');
const leaderCertificateFingerprint = 'ab'.repeat(32);

const leaderEndpoint: MasterNodeEndpoint = {
  hostname: 'leader.internal',
  port: 4410,
  scheme: 'grpcs'
};

const cluster: Cluster = {
  id: CLUSTER_RECORD_ID,
  clusterId: '00000000-0000-4000-8000-000000000010',
  membershipRevision: 2n,
  createdAt: now,
  updatedAt: now
};

const membershipSnapshot: ClusterMembershipSnapshot = {
  cluster: {
    ...cluster,
    membershipRevision: 3n
  },
  masterNodes: [],
  dataNodes: []
};

/* mocks */

const createMasterNodeGrpcClientMock = (): jest.Mocked<MasterNodeGrpcClientContract> => {
  return {
    fetchMasterInfo: jest.fn<MasterNodeGrpcClientContract['fetchMasterInfo']>(),
    registerMasterNode: jest.fn<MasterNodeGrpcClientContract['registerMasterNode']>(),
    fetchClusterMembershipSnapshot: jest
      .fn<MasterNodeGrpcClientContract['fetchClusterMembershipSnapshot']>()
      .mockResolvedValue(membershipSnapshot),
    fetchTaskEntries: jest.fn<MasterNodeGrpcClientContract['fetchTaskEntries']>(),
    fetchTaskPayload: jest.fn<MasterNodeGrpcClientContract['fetchTaskPayload']>(),
    forwardTask: jest.fn<MasterNodeGrpcClientContract['forwardTask']>(),
    requestVote: jest.fn<MasterNodeGrpcClientContract['requestVote']>(),
    recordLeaderHeartbeat: jest.fn<MasterNodeGrpcClientContract['recordLeaderHeartbeat']>(),
    close: jest.fn<MasterNodeGrpcClientContract['close']>()
  };
};

const createClusterServiceMock = (): jest.Mocked<ClusterServiceContract> => {
  return {
    getCluster: jest.fn<ClusterServiceContract['getCluster']>().mockResolvedValue(cluster),
    applyMembershipSnapshot: jest.fn<ClusterServiceContract['applyMembershipSnapshot']>()
  } as unknown as jest.Mocked<ClusterServiceContract>;
};

/* tests */

describe('MasterNodeClusterSynchronizationHandler', () => {
  let masterNodeGrpcClient: jest.Mocked<MasterNodeGrpcClientContract>;
  let clusterService: jest.Mocked<ClusterServiceContract>;
  let handler: MasterNodeClusterSynchronizationHandler;

  beforeEach(() => {
    masterNodeGrpcClient = createMasterNodeGrpcClientMock();
    clusterService = createClusterServiceMock();
    handler = new MasterNodeClusterSynchronizationHandler(masterNodeGrpcClient, clusterService);
  });

  test('does nothing when local membership matches the leader revision', async () => {
    await expect(
      handler.synchronize({
        masterNodeEndpoint: leaderEndpoint,
        expectedCertificateFingerprint: leaderCertificateFingerprint,
        leaderMembershipRevision: cluster.membershipRevision
      })
    ).resolves.toBeUndefined();

    expect(masterNodeGrpcClient.fetchClusterMembershipSnapshot).not.toHaveBeenCalled();
    expect(clusterService.applyMembershipSnapshot).not.toHaveBeenCalled();
  });

  test('applies a newer membership snapshot from the leader', async () => {
    await expect(
      handler.synchronize({
        masterNodeEndpoint: leaderEndpoint,
        expectedCertificateFingerprint: leaderCertificateFingerprint,
        leaderMembershipRevision: membershipSnapshot.cluster.membershipRevision
      })
    ).resolves.toBeUndefined();

    expect(masterNodeGrpcClient.fetchClusterMembershipSnapshot).toHaveBeenCalledWith({
      masterNodeEndpoint: leaderEndpoint,
      expectedCertificateFingerprint: leaderCertificateFingerprint
    });
    expect(clusterService.applyMembershipSnapshot).toHaveBeenCalledWith(membershipSnapshot);
  });

  test('rejects a leader membership revision behind local state', async () => {
    await expect(
      handler.synchronize({
        masterNodeEndpoint: leaderEndpoint,
        expectedCertificateFingerprint: leaderCertificateFingerprint,
        leaderMembershipRevision: 1n
      })
    ).rejects.toBeInstanceOf(GenericFailedPreconditionError);

    expect(masterNodeGrpcClient.fetchClusterMembershipSnapshot).not.toHaveBeenCalled();
    expect(clusterService.applyMembershipSnapshot).not.toHaveBeenCalled();
  });

  test('rejects a fetched snapshot behind the announced leader revision', async () => {
    await expect(
      handler.synchronize({
        masterNodeEndpoint: leaderEndpoint,
        expectedCertificateFingerprint: leaderCertificateFingerprint,
        leaderMembershipRevision: 4n
      })
    ).rejects.toBeInstanceOf(GenericFailedPreconditionError);

    expect(clusterService.applyMembershipSnapshot).not.toHaveBeenCalled();
  });
});
