import { GenericConflictError } from '@/errors/application.errors';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { MasterNodeId } from '@/modules/master-nodes/master-node.domain';

import type { MasterBootstrapResult } from './bootstrap.application';

/* contract */

type BootstrapServiceContract = {
  bootstrapAsLeader(): Promise<MasterBootstrapResult>;
};

/* service */

class BootstrapService implements BootstrapServiceContract {
  constructor(
    private readonly consensusService: ConsensusServiceContract,
    private readonly selfMasterNodeId: MasterNodeId
  ) {}

  async bootstrapAsLeader(): Promise<MasterBootstrapResult> {
    const state = await this.consensusService.getConsensusState();

    if (state.leaderMasterId !== null && state.leaderMasterId !== this.selfMasterNodeId) {
      throw new GenericConflictError('Another master node is already the cluster leader');
    }

    const leaderState = await this.consensusService.bootstrapLeadership(this.selfMasterNodeId);

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
