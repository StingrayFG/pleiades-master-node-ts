import { GenericConflictError } from '@/errors/application.errors';
import type { ClusterServiceContract } from '@/modules/cluster/cluster.service';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { RegisterMasterNodeInput } from '@/modules/master-nodes/master-node.application';
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
      masterNodeEndpoint: input.leaderEndpoint
    });

    if (leaderInfo.masterId === this.selfMasterNode.id) {
      throw new GenericConflictError('A master node cannot follow itself');
    }

    if (state.leaderMasterId !== null && state.leaderMasterId !== leaderInfo.masterId) {
      throw new GenericConflictError('This master node already belongs to a different leader');
    }

    await this.clusterService.registerCluster(leaderInfo.clusterId);

    // the leader's row must exist locally so replicated entries can reference it
    await this.masterNodeService.registerMasterNode({
      id: leaderInfo.masterId,

      certificateFingerprint: input.leaderCertificateFingerprint,
      sessionId: leaderInfo.sessionId,
      state: 'active',
      mode: 'serving',

      endpoint: input.leaderEndpoint
    });

    await this.masterNodeService.registerMasterNode({
      ...this.selfMasterNode,
      state: 'joining',
      mode: 'serving'
    });

    const followerState = await this.consensusService.acceptFollowership(leaderInfo.masterId, leaderInfo.epoch);

    await this.masterNodeService.registerMasterNode({
      ...this.selfMasterNode,
      state: 'active',
      mode: 'serving'
    });

    return {
      role: 'follower',
      epoch: followerState.currentEpoch,
      leaderMasterId: followerState.leaderMasterId
    };
  }
}

/* exports */

export { BootstrapService };
export type { BootstrapServiceContract };
