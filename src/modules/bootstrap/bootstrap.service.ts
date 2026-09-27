import { GenericConflictError } from '@/errors/application.errors';
import type { ClusterMembershipSnapshot } from '@/modules/cluster/cluster.membership-snapshot';
import type { ClusterServiceContract } from '@/modules/cluster/cluster.service';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type {
  FetchMasterInfoInternodeResult,
  RegisterMasterNodeInput
} from '@/modules/master-nodes/master-node.application';
import type { MasterNodeCertificateFingerprint } from '@/modules/master-nodes/master-node.domain';
import type { MasterNodeGrpcClientContract } from '@/modules/master-nodes/master-node.grpc-client';
import type { MasterNodeServiceContract } from '@/modules/master-nodes/master-node.service';

import type { BootstrapAsFollowerInput, MasterBootstrapResult } from './bootstrap.application';

/* contract */

type BootstrapServiceContract = {
  bootstrapAsLeader(): Promise<MasterBootstrapResult>;
  bootstrapAsFollower(input: BootstrapAsFollowerInput): Promise<MasterBootstrapResult>;
};

/* service */

class BootstrapService implements BootstrapServiceContract {
  constructor(
    private readonly clusterService: ClusterServiceContract,
    private readonly consensusService: ConsensusServiceContract,
    private readonly masterNodeService: MasterNodeServiceContract,
    private readonly masterNodeGrpcClient: MasterNodeGrpcClientContract,
    private readonly selfMasterNode: Omit<RegisterMasterNodeInput, 'state' | 'mode'>
  ) {}

  async bootstrapAsLeader(): Promise<MasterBootstrapResult> {
    const state = await this.consensusService.getConsensusState();

    if (state.leaderMasterId === this.selfMasterNode.id) {
      throw new GenericConflictError('This master node is already the cluster leader');
    }

    if (state.leaderMasterId !== null) {
      throw new GenericConflictError('Another master node is already the cluster leader');
    }

    await this.clusterService.initializeCluster();

    await this.masterNodeService.registerMasterNode({
      ...this.selfMasterNode,
      state: 'joining',
      mode: 'serving'
    });

    const leaderState = await this.consensusService.bootstrapLeadership(this.selfMasterNode.id);

    if (leaderState.leaderMasterId !== this.selfMasterNode.id) {
      throw new GenericConflictError('Another master node claimed the cluster leadership first');
    }

    await this.masterNodeService.registerMasterNode({
      ...this.selfMasterNode,
      state: 'active',
      mode: 'serving'
    });

    return {
      role: 'leader',
      epoch: leaderState.currentEpoch,
      leaderMasterId: leaderState.leaderMasterId
    };
  }

  async bootstrapAsFollower(input: BootstrapAsFollowerInput): Promise<MasterBootstrapResult> {
    const state = await this.consensusService.getConsensusState();

    if (state.leaderMasterId === this.selfMasterNode.id) {
      throw new GenericConflictError('This master node is the cluster leader and cannot become a follower');
    }

    const leaderInfo = await this.masterNodeGrpcClient.fetchMasterInfo({
      masterNodeEndpoint: input.leaderEndpoint,
      expectedCertificateFingerprint: input.leaderCertificateFingerprint
    });

    if (leaderInfo.masterId === this.selfMasterNode.id) {
      throw new GenericConflictError('A master node cannot follow itself');
    }

    if (state.leaderMasterId !== null && state.leaderMasterId !== leaderInfo.masterId) {
      throw new GenericConflictError('This master node already belongs to a different leader');
    }

    await this.clusterService.registerCluster(leaderInfo.clusterId);

    await this.masterNodeGrpcClient.registerMasterNode({
      masterNodeEndpoint: input.leaderEndpoint,
      expectedCertificateFingerprint: input.leaderCertificateFingerprint,

      id: this.selfMasterNode.id,
      sessionId: this.selfMasterNode.sessionId,
      clusterId: leaderInfo.clusterId,
      endpoint: this.selfMasterNode.endpoint
    });

    const snapshot = await this.masterNodeGrpcClient.fetchClusterMembershipSnapshot({
      masterNodeEndpoint: input.leaderEndpoint,
      expectedCertificateFingerprint: input.leaderCertificateFingerprint
    });

    this.requireValidMembershipSnapshot(snapshot, leaderInfo, input.leaderCertificateFingerprint);

    await this.clusterService.applyMembershipSnapshot(snapshot);

    const followerState = await this.consensusService.acceptFollowership(leaderInfo.masterId, leaderInfo.epoch);

    return {
      role: 'follower',
      epoch: followerState.currentEpoch,
      leaderMasterId: followerState.leaderMasterId
    };
  }

  /* private methods */

  private requireValidMembershipSnapshot(
    snapshot: ClusterMembershipSnapshot,
    leaderInfo: FetchMasterInfoInternodeResult,
    leaderCertificateFingerprint: MasterNodeCertificateFingerprint
  ): void {
    const snapshotLeader = snapshot.masterNodes.find((masterNode) => masterNode.id === leaderInfo.masterId);
    const snapshotSelf = snapshot.masterNodes.find((masterNode) => masterNode.id === this.selfMasterNode.id);

    if (
      !snapshotLeader ||
      snapshotLeader.certificateFingerprint !== leaderCertificateFingerprint ||
      snapshotLeader.sessionId !== leaderInfo.sessionId
    ) {
      throw new GenericConflictError('Cluster membership snapshot does not match the authenticated leader');
    }

    if (
      !snapshotSelf ||
      snapshotSelf.certificateFingerprint !== this.selfMasterNode.certificateFingerprint ||
      snapshotSelf.sessionId !== this.selfMasterNode.sessionId
    ) {
      throw new GenericConflictError('Cluster membership snapshot does not contain the registered local master node');
    }
  }
}

/* exports */

export { BootstrapService };
export type { BootstrapServiceContract };
