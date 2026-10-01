import type { LeadershipServiceContract } from '../leadership.service';

/* contract */

type LeadershipCommitmentHandlerContract = {
  run(): Promise<void>;
};

/* handler */

// advance the committed sequence independently of heartbeat rounds
// so locally replicated tasks can be committed without waiting for the next heartbeat.
class LeadershipCommitmentHandler implements LeadershipCommitmentHandlerContract {
  constructor(private readonly leadershipService: LeadershipServiceContract) {}

  async run(): Promise<void> {
    await this.leadershipService.evaluateCommitment();
  }
}

/* exports */

export { LeadershipCommitmentHandler };
export type { LeadershipCommitmentHandlerContract };
