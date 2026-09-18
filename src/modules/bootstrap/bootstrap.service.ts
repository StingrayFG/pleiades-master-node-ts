import { GenericConflictError } from '@/errors/application.errors';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { RegisterMasterNodeInput } from '@/modules/master-nodes/master-node.application';
import type { MasterNodeServiceContract } from '@/modules/master-nodes/master-node.service';

import type { MasterBootstrapResult } from './bootstrap.application';

/* contract */

type BootstrapServiceContract = {
  bootstrapAsLeader(): Promise<MasterBootstrapResult>;
};

/* service */

class BootstrapService implements BootstrapServiceContract {
  constructor(
    private readonly consensusService: ConsensusServiceContract,
    private readonly masterNodeService: MasterNodeServiceContract,
    private readonly selfMasterNode: Omit<RegisterMasterNodeInput, 'state' | 'mode'>
  ) {}

  async bootstrapAsLeader(): Promise<MasterBootstrapResult> {
    await this.masterNodeService.registerMasterNode({
      ...this.selfMasterNode,
      state: 'joining',
      mode: 'serving'
    });

    const state = await this.consensusService.getConsensusState();

    if (state.leaderMasterId !== null && state.leaderMasterId !== this.selfMasterNode.id) {
      throw new GenericConflictError('Another master node is already the cluster leader');
    }

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
}

/* exports */

export { BootstrapService };
export type { BootstrapServiceContract };
