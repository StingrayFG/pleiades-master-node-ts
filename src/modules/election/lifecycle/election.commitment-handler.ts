import type { ElectionServiceContract } from '../election.service';

/* contract */

type ElectionCommitmentHandlerContract = {
  run(): Promise<void>;
};

/* handler */

// advances the leader's committed sequence between heartbeat rounds so clusters
// with a small or zero follower set do not wait a full heartbeat interval to commit
class ElectionCommitmentHandler implements ElectionCommitmentHandlerContract {
  constructor(private readonly electionService: ElectionServiceContract) {}

  async run(): Promise<void> {
    await this.electionService.evaluateCommitment();
  }
}

/* exports */

export { ElectionCommitmentHandler };
export type { ElectionCommitmentHandlerContract };
