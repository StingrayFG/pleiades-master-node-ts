import { GenericAbortedError, GenericAlreadyExistsError } from '@/errors/application.errors';
import type { MasterNodeId } from '@/modules/master-nodes/master-node.domain';
import type { TaskSequence } from '@/modules/tasks/task.domain';

import type {
  AllocatedSequenceTransactionAction,
  ConsensusLeadershipContext,
  LeadershipContextTransactionAction,
  ConsensusVoteResult,
  RequestConsensusVoteInput,
  RewoundSequenceTransactionAction
} from './consensus.application';
import type { ConsensusEpoch, ConsensusLastSequence, ConsensusState } from './consensus.domain';
import { isElectionStarterLogUpToDate } from './consensus.policies';
import type { ConsensusStateRepositoryContract } from './consensus.repository';
import {
  verifyAppliedSequenceWithinCommitted,
  verifyCommittedSequenceWithinAllocated,
  verifyElectionCompleted,
  verifyElectionStarted,
  verifyNewerEpochAdopted,
  verifyFollowershipAcceptable,
  verifyFollowershipAccepted,
  verifyLeadershipSequenceAdvancementNotAborted,
  verifyLeadershipReleased,
  verifyMatchedSequenceWithinAllocated,
  verifySequenceAdvancementNotAborted,
  verifySequenceWithinRewindBounds
} from './consensus.verifiers';

/* contract */

type ConsensusServiceContract = {
  // state
  getConsensusState(): Promise<ConsensusState>;

  // sequence
  advanceLastAllocatedSequence(
    sequence: TaskSequence,
    leadershipContext: ConsensusLeadershipContext
  ): Promise<ConsensusState>;
  advanceLastMatchedSequence(
    sequence: ConsensusLastSequence,
    leadershipContext: ConsensusLeadershipContext
  ): Promise<ConsensusState>;
  advanceLastCommittedSequence(
    sequence: TaskSequence,
    leadershipContext: ConsensusLeadershipContext
  ): Promise<ConsensusState>;
  advanceLastAppliedSequence(sequence: TaskSequence): Promise<ConsensusState>;
  withAdvancedLastAllocatedSequence<TResult>(
    leadershipContext: ConsensusLeadershipContext,
    action: AllocatedSequenceTransactionAction<TResult>
  ): Promise<TResult>;
  withRewoundLastAllocatedSequence<TResult>(
    leadershipContext: ConsensusLeadershipContext,
    sequence: ConsensusLastSequence,
    action: RewoundSequenceTransactionAction<TResult>
  ): Promise<TResult>;

  // leadership
  withLeadershipContext<TResult>(
    leadershipContext: ConsensusLeadershipContext,
    action: LeadershipContextTransactionAction<TResult>
  ): Promise<TResult>;
  claimInitialLeadership(selfMasterNodeId: MasterNodeId): Promise<ConsensusState>;
  acceptFollowership(leadershipContext: ConsensusLeadershipContext): Promise<ConsensusState>;
  releaseLeadership(leadershipContext: ConsensusLeadershipContext): Promise<ConsensusState>;

  // election
  startElection(): Promise<ConsensusState>;
  completeElection(epoch: ConsensusEpoch, electionStarterMasterNodeId: MasterNodeId): Promise<ConsensusState>;
  adoptNewerEpoch(epoch: ConsensusEpoch): Promise<ConsensusState>;
  requestVote(input: RequestConsensusVoteInput): Promise<ConsensusVoteResult>;
};

/* service */

class ConsensusService implements ConsensusServiceContract {
  constructor(
    private readonly repository: ConsensusStateRepositoryContract,
    private readonly selfMasterNodeId: MasterNodeId
  ) {}

  /* state methods */

  async getConsensusState(): Promise<ConsensusState> {
    const existingConsensusState = await this.repository.findState();

    if (existingConsensusState) {
      return existingConsensusState;
    }

    try {
      return await this.repository.createState();
    } catch (err) {
      if (!(err instanceof GenericAlreadyExistsError)) {
        throw err;
      }

      const createdConsensusState = await this.repository.findState();

      if (!createdConsensusState) {
        throw err;
      }

      return createdConsensusState;
    }
  }

  /* sequence methods */

  async advanceLastAllocatedSequence(
    sequence: TaskSequence,
    leadershipContext: ConsensusLeadershipContext
  ): Promise<ConsensusState> {
    await this.getConsensusState();

    const updatedConsensusState = await this.repository.advanceLastAllocatedSequence({
      sequence,
      leadershipContext
    });

    try {
      verifyLeadershipSequenceAdvancementNotAborted(
        updatedConsensusState,
        leadershipContext,
        sequence,
        updatedConsensusState.lastAllocatedSequence
      );
    } catch (err) {
      throw new GenericAbortedError('Allocated sequence advancement was aborted by a concurrent consensus change', {
        cause: err
      });
    }

    return updatedConsensusState;
  }

  async advanceLastMatchedSequence(
    sequence: ConsensusLastSequence,
    leadershipContext: ConsensusLeadershipContext
  ): Promise<ConsensusState> {
    const consensusState = await this.getConsensusState();

    verifyMatchedSequenceWithinAllocated(consensusState, sequence);

    const updatedConsensusState = await this.repository.advanceLastMatchedSequence({
      sequence,
      leadershipContext
    });

    try {
      verifyLeadershipSequenceAdvancementNotAborted(
        updatedConsensusState,
        leadershipContext,
        sequence,
        updatedConsensusState.lastMatchedSequence
      );
    } catch (err) {
      throw new GenericAbortedError('Matched sequence advancement was aborted by a concurrent consensus change', {
        cause: err
      });
    }

    return updatedConsensusState;
  }

  async advanceLastCommittedSequence(
    sequence: TaskSequence,
    leadershipContext: ConsensusLeadershipContext
  ): Promise<ConsensusState> {
    const consensusState = await this.getConsensusState();

    verifyCommittedSequenceWithinAllocated(consensusState, sequence);

    const updatedConsensusState = await this.repository.advanceLastCommittedSequence({
      sequence,
      leadershipContext
    });

    try {
      verifyLeadershipSequenceAdvancementNotAborted(
        updatedConsensusState,
        leadershipContext,
        sequence,
        updatedConsensusState.lastCommittedSequence
      );
    } catch (err) {
      throw new GenericAbortedError('Committed sequence advancement was aborted by a concurrent consensus change', {
        cause: err
      });
    }

    return updatedConsensusState;
  }

  async advanceLastAppliedSequence(sequence: TaskSequence): Promise<ConsensusState> {
    const consensusState = await this.getConsensusState();

    verifyAppliedSequenceWithinCommitted(consensusState, sequence);

    const updatedConsensusState = await this.repository.advanceLastAppliedSequence({
      sequence
    });

    try {
      verifySequenceAdvancementNotAborted(sequence, updatedConsensusState.lastAppliedSequence);
    } catch (err) {
      throw new GenericAbortedError('Applied sequence advancement was aborted by a concurrent consensus change', {
        cause: err
      });
    }

    return updatedConsensusState;
  }

  // runs the action in the same transaction that advances the last allocated sequence.
  async withAdvancedLastAllocatedSequence<TResult>(
    leadershipContext: ConsensusLeadershipContext,
    action: AllocatedSequenceTransactionAction<TResult>
  ): Promise<TResult> {
    await this.getConsensusState();

    return this.repository.withAdvancedLastAllocatedSequence(
      {
        leadershipContext
      },
      action
    );
  }

  // runs the action in the same transaction that rewinds the last allocated sequence.
  async withRewoundLastAllocatedSequence<TResult>(
    leadershipContext: ConsensusLeadershipContext,
    sequence: ConsensusLastSequence,
    action: RewoundSequenceTransactionAction<TResult>
  ): Promise<TResult> {
    const consensusState = await this.getConsensusState();

    verifySequenceWithinRewindBounds(consensusState, sequence);

    return this.repository.withRewoundLastAllocatedSequence(
      {
        sequence,
        leadershipContext
      },
      action
    );
  }

  /* leadership methods */

  // runs the action in a transaction that only commits while the caller's epoch
  // and leadership still hold, so a deposed leader cannot land writes
  async withLeadershipContext<TResult>(
    leadershipContext: ConsensusLeadershipContext,
    action: LeadershipContextTransactionAction<TResult>
  ): Promise<TResult> {
    await this.getConsensusState();

    return this.repository.withLeadershipContext(leadershipContext, action);
  }

  // used during initial cluster bootstrap to claim leadership before any leader exists.
  // this transition advances the epoch and records the bootstrapping node as leader with its self-vote.
  async claimInitialLeadership(selfMasterNodeId: MasterNodeId): Promise<ConsensusState> {
    const initialConsensusState = await this.getConsensusState();

    if (initialConsensusState.leaderMasterId === selfMasterNodeId) {
      return initialConsensusState;
    }

    if (initialConsensusState.leaderMasterId !== null) {
      return initialConsensusState;
    }

    await this.repository.claimLeadership({
      leadershipContext: {
        epoch: initialConsensusState.currentEpoch + 1n,
        leaderMasterId: selfMasterNodeId
      },
      lastLeaderContactAt: new Date(),
      matchedSequence: initialConsensusState.lastCommittedSequence
    });

    return this.getConsensusState();
  }

  // used locally by a node becoming or staying a follower when bootstrap, replication,
  // or a heartbeat confirms a remote leader for the current or a newer epoch.
  // this transition records the remote leader and contact time, resetting matched sequence progress if leadership changed.
  async acceptFollowership(leadershipContext: ConsensusLeadershipContext): Promise<ConsensusState> {
    const initialConsensusState = await this.getConsensusState();

    verifyFollowershipAcceptable(initialConsensusState, leadershipContext);

    // reset the matched sequence if the leader or epoch has changed
    const matchedSequence =
      initialConsensusState.currentEpoch !== leadershipContext.epoch ||
      initialConsensusState.leaderMasterId !== leadershipContext.leaderMasterId
        ? initialConsensusState.lastCommittedSequence
        : initialConsensusState.lastMatchedSequence;

    await this.repository.acceptFollowership({
      leadershipContext,
      lastLeaderContactAt: new Date(),
      matchedSequence
    });

    const acceptedLeaderConsensusState = await this.getConsensusState();

    verifyFollowershipAccepted(acceptedLeaderConsensusState, leadershipContext);

    return acceptedLeaderConsensusState;
  }

  // used by the leader when it becomes ineligible or loses contact with the quorum.
  // this transition clears the known leader and resets matched sequence progress without advancing the epoch.
  async releaseLeadership(leadershipContext: ConsensusLeadershipContext): Promise<ConsensusState> {
    const initialConsensusState = await this.getConsensusState();

    await this.repository.releaseLeadership({
      leadershipContext,
      matchedSequence: initialConsensusState.lastCommittedSequence
    });

    const releasedLeadershipConsensusState = await this.getConsensusState();

    verifyLeadershipReleased(releasedLeadershipConsensusState, leadershipContext);

    return releasedLeadershipConsensusState;
  }

  /* election methods */

  // can be used by an election-eligible follower (election starter)
  // when it loses contact with the leader to start a new election.
  // this transition increments the epoch in advance, clears the known leader,
  // records the self-vote (i.e. the node that started the election votes for itself),
  // and resets the matched sequence progress to the committed sequence.
  async startElection(): Promise<ConsensusState> {
    const initialConsensusState = await this.getConsensusState();
    const electionEpoch = initialConsensusState.currentEpoch + 1n;

    const electionConsensusState = await this.repository.startElection({
      expectedEpoch: initialConsensusState.currentEpoch,
      electionEpoch,
      electionStarterMasterNodeId: this.selfMasterNodeId,
      matchedSequence: initialConsensusState.lastCommittedSequence
    });

    verifyElectionStarted(electionConsensusState, electionEpoch, this.selfMasterNodeId);

    return electionConsensusState;
  }

  // used by a follower that started an election (election starter) after it receives votes from the quorum.
  // this transition promotes the election starter to leader only if the epoch and self-vote still match,
  // then records last leader contact timestamp and resets matched sequence progress to the committed sequence.
  async completeElection(epoch: ConsensusEpoch, electionStarterMasterNodeId: MasterNodeId): Promise<ConsensusState> {
    const initialConsensusState = await this.getConsensusState();

    await this.repository.claimLeadership({
      leadershipContext: {
        epoch,
        leaderMasterId: electionStarterMasterNodeId
      },
      lastLeaderContactAt: new Date(),
      matchedSequence: initialConsensusState.lastCommittedSequence
    });

    const leaderConsensusState = await this.getConsensusState();

    verifyElectionCompleted(leaderConsensusState, epoch, electionStarterMasterNodeId);

    return leaderConsensusState;
  }

  // used when any master node learns that another master node has reached a newer epoch,
  // be it through a vote response or heartbeat response.
  // this transition increments currentEpoch, clears the known leader, vote,
  // leader contact timestamp, and resets matched sequence progress to the committed sequence.
  async adoptNewerEpoch(epoch: ConsensusEpoch): Promise<ConsensusState> {
    const initialConsensusState = await this.getConsensusState();

    if (epoch <= initialConsensusState.currentEpoch) {
      return initialConsensusState;
    }

    const adoptedConsensusState = await this.repository.adoptNewerEpoch({
      epoch,
      matchedSequence: initialConsensusState.lastCommittedSequence
    });

    verifyNewerEpochAdopted(adoptedConsensusState, epoch);

    return adoptedConsensusState;
  }

  // used when this node receives a vote request from the follower that started an election (election starter).
  // it first compares the election starter's log position from the request with the local log,
  // then atomically applies the Raft voting rules in the repository.
  // if the request epoch is newer, this transition advances the current epoch and clears the known leader and vote.
  // this node votes for the election starter only if its epoch matches the local epoch, its log is up to date,
  // and no different leader or vote is recorded for the local epoch.
  async requestVote(input: RequestConsensusVoteInput): Promise<ConsensusVoteResult> {
    return this.repository.applyVoteRequest({
      epoch: input.epoch,
      electionStarterMasterNodeId: input.electionStarterMasterNodeId,
      electionStarterLogIsUpToDate: isElectionStarterLogUpToDate(input)
    });
  }
}

/* exports */

export { ConsensusService };
export type { ConsensusServiceContract };
