import { GenericInternalServerError } from '@/errors/application.errors';
import { createAggregateErrorCause, type ErrorCauseEntry } from '@/errors/error-causes';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { ElectionServiceContract } from '@/modules/election/election.service';
import type { ElectionLifecycleHandlerContract } from '@/modules/election/lifecycle/election.lifecycle-handler';

import type { MasterNodeId } from '../master-node.domain';
import type { MasterNodeReplicationHandlerContract } from '../master-node.replication-handler';

/* contract */

type MasterNodeLifecycleHandlerContract = {
  run(now?: Date): Promise<void>;
};

/* handler */

class MasterNodeLifecycleHandler implements MasterNodeLifecycleHandlerContract {
  constructor(
    private readonly consensusService: ConsensusServiceContract,
    private readonly electionService: ElectionServiceContract,
    private readonly electionLifecycleHandler: ElectionLifecycleHandlerContract,
    private readonly replicationHandler: MasterNodeReplicationHandlerContract,
    private readonly selfMasterNodeId: MasterNodeId
  ) {}

  async run(now = new Date()): Promise<void> {
    const consensusState = await this.consensusService.getConsensusState();

    if (consensusState.leaderMasterId === this.selfMasterNodeId) {
      await this.electionService.broadcastLeaderHeartbeat(now);
      return;
    }

    await this.runFollowerLifecycle(now);
  }

  private async runFollowerLifecycle(now: Date): Promise<void> {
    const errors: ErrorCauseEntry[] = [];

    try {
      await this.replicationHandler.run();
    } catch (err) {
      errors.push({
        source: 'replication',
        error: err
      });
    }

    try {
      await this.electionLifecycleHandler.run(now);
    } catch (err) {
      errors.push({
        source: 'election',
        error: err
      });
    }

    if (errors.length > 0) {
      const cause = createAggregateErrorCause(errors);

      throw new GenericInternalServerError('Master node follower lifecycle execution failed', { cause });
    }
  }
}

/* exports */

export { MasterNodeLifecycleHandler };
export type { MasterNodeLifecycleHandlerContract };
