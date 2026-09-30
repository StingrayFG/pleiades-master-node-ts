import type { ClusterServiceContract } from '@/modules/cluster/cluster.service';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { RegisterMasterNodeInput } from '@/modules/master-nodes/master-node.application';
import type { MasterNodeGrpcClientContract } from '@/modules/master-nodes/master-node.grpc-client';
import type { MasterNodeServiceContract } from '@/modules/master-nodes/master-node.service';

import type { BootstrapAsFollowerInput, MasterBootstrapResult } from './bootstrap.application';
import {
  verifyBootstrapMembershipSnapshot,
  verifyFollowerBootstrapAvailable,
  verifyFollowerBootstrapTarget,
  verifyInitialLeadershipClaimed,
  verifyLeaderBootstrapAvailable
} from './bootstrap.verifiers';

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

  /* public methods */

  async bootstrapAsLeader(): Promise<MasterBootstrapResult> {
    const initialConsensusState = await this.consensusService.getConsensusState();

    verifyLeaderBootstrapAvailable(initialConsensusState, this.selfMasterNode.id);

    await this.clusterService.initializeCluster();

    await this.masterNodeService.registerMasterNode({
      ...this.selfMasterNode,
      state: 'joining',
      mode: 'serving'
    });

    const leaderConsensusState = await this.consensusService.claimInitialLeadership(this.selfMasterNode.id);

    verifyInitialLeadershipClaimed(leaderConsensusState, this.selfMasterNode.id);

    await this.masterNodeService.registerMasterNode({
      ...this.selfMasterNode,
      state: 'active',
      mode: 'serving'
    });

    return {
      role: 'leader',
      epoch: leaderConsensusState.currentEpoch,
      leaderMasterId: this.selfMasterNode.id
    };
  }

  async bootstrapAsFollower(input: BootstrapAsFollowerInput): Promise<MasterBootstrapResult> {
    const initialConsensusState = await this.consensusService.getConsensusState();

    verifyFollowerBootstrapAvailable(initialConsensusState, this.selfMasterNode.id);

    const leaderInfo = await this.masterNodeGrpcClient.fetchMasterInfo({
      masterNodeEndpoint: input.leaderEndpoint,
      expectedCertificateFingerprint: input.leaderCertificateFingerprint
    });

    verifyFollowerBootstrapTarget(initialConsensusState, leaderInfo.masterId, this.selfMasterNode.id);

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

    verifyBootstrapMembershipSnapshot(snapshot, leaderInfo, input.leaderCertificateFingerprint, this.selfMasterNode);

    await this.clusterService.applyMembershipSnapshot(snapshot);

    const followerConsensusState = await this.consensusService.acceptFollowership({
      epoch: leaderInfo.epoch,
      leaderMasterId: leaderInfo.masterId
    });

    return {
      role: 'follower',
      epoch: followerConsensusState.currentEpoch,
      leaderMasterId: leaderInfo.masterId
    };
  }
}

/* exports */

export { BootstrapService };
export type { BootstrapServiceContract };
