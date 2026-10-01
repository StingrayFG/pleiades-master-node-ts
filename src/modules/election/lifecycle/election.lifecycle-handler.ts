import type { ConsensusState } from '@/modules/consensus/consensus.domain';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { MasterNodeId } from '@/modules/master-nodes/master-node.domain';
import type { MasterNodeServiceContract } from '@/modules/master-nodes/master-node.service';

import type { ElectionConfig } from '../election.config';
import { isMasterNodeEligibleForElection, resolveElectionTimeoutMs } from '../election.policies';
import type { ElectionServiceContract } from '../election.service';

/* contract */

type ElectionLifecycleHandlerContract = {
  run(now?: Date): Promise<void>;
};

/* handler */

class ElectionLifecycleHandler implements ElectionLifecycleHandlerContract {
  private observedEpoch: bigint | null = null;
  private observedLeaderMasterNodeId: MasterNodeId | null = null;
  private observedLeaderContactAtMs: number | null = null;
  private electionDeadlineAtMs: number | null = null;

  constructor(
    private readonly consensusService: ConsensusServiceContract,
    private readonly electionService: ElectionServiceContract,
    private readonly masterNodeService: MasterNodeServiceContract,
    private readonly selfMasterNodeId: MasterNodeId,
    private readonly config: ElectionConfig
  ) {}

  async run(now = new Date()): Promise<void> {
    const consensusState = await this.consensusService.getConsensusState();
    const selfMasterNode = (await this.masterNodeService.listMasterNodes()).find(
      (masterNode) => masterNode.id === this.selfMasterNodeId
    );

    if (!selfMasterNode) {
      this.clearElectionDeadline();
      return;
    }

    if (consensusState.leaderMasterId === this.selfMasterNodeId) {
      this.clearElectionDeadline();
      return;
    }

    if (!isMasterNodeEligibleForElection(selfMasterNode)) {
      this.clearElectionDeadline();
      return;
    }

    // follower-only election logic next

    this.synchronizeElectionDeadline(consensusState, now);

    if (this.electionDeadlineAtMs !== null && now.getTime() < this.electionDeadlineAtMs) {
      return;
    }

    await this.electionService.runElection();

    const nextState = await this.consensusService.getConsensusState();
    this.setElectionDeadline(nextState, now);
  }

  private synchronizeElectionDeadline(consensusState: ConsensusState, now: Date): void {
    const leaderContactAtMs = consensusState.lastLeaderContactAt?.getTime() ?? null;
    const stateChanged =
      this.observedEpoch !== consensusState.currentEpoch ||
      this.observedLeaderMasterNodeId !== consensusState.leaderMasterId ||
      this.observedLeaderContactAtMs !== leaderContactAtMs;

    if (!stateChanged) {
      return;
    }

    this.setElectionDeadline(consensusState, now);
  }

  private setElectionDeadline(consensusState: ConsensusState, now: Date): void {
    const leaderContactAtMs = consensusState.lastLeaderContactAt?.getTime() ?? null;
    const timeoutBaseMs = leaderContactAtMs ?? now.getTime();

    this.observedEpoch = consensusState.currentEpoch;
    this.observedLeaderMasterNodeId = consensusState.leaderMasterId;
    this.observedLeaderContactAtMs = leaderContactAtMs;
    this.electionDeadlineAtMs = timeoutBaseMs + resolveElectionTimeoutMs(this.config);
  }

  private clearElectionDeadline(): void {
    this.observedEpoch = null;
    this.observedLeaderMasterNodeId = null;
    this.observedLeaderContactAtMs = null;
    this.electionDeadlineAtMs = null;
  }
}

/* exports */

export { ElectionLifecycleHandler };
export type { ElectionLifecycleHandlerContract };
