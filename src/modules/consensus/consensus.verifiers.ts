import { GenericAbortedError, GenericConflictError, GenericFailedPreconditionError } from '@/errors/application.errors';
import type { MasterNodeId } from '@/modules/master-nodes/master-node.domain';

import type { ConsensusLeadershipContext, RequestConsensusVoteInput } from './consensus.application';
import type { ConsensusEpoch, ConsensusLastSequence, ConsensusState } from './consensus.domain';

/* sequence verifiers */

export const verifyCommittedSequenceWithinAllocated = (
  state: ConsensusState,
  sequence: ConsensusLastSequence
): void => {
  if (sequence > state.lastAllocatedSequence) {
    throw new GenericFailedPreconditionError(
      'Cannot advance the committed sequence beyond the last allocated sequence'
    );
  }
};

export const verifyAppliedSequenceWithinCommitted = (state: ConsensusState, sequence: ConsensusLastSequence): void => {
  if (sequence > state.lastCommittedSequence) {
    throw new GenericFailedPreconditionError('Cannot advance the applied sequence beyond the last committed sequence');
  }
};

export const verifyMatchedSequenceWithinAllocated = (state: ConsensusState, sequence: ConsensusLastSequence): void => {
  if (sequence > state.lastAllocatedSequence) {
    throw new GenericFailedPreconditionError('Cannot advance the matched sequence beyond the last allocated sequence');
  }
};

export const verifySequenceWithinRewindBounds = (state: ConsensusState, sequence: ConsensusLastSequence): void => {
  if (sequence < state.lastCommittedSequence) {
    throw new GenericFailedPreconditionError('Cannot rewind the allocated sequence below the committed sequence');
  }

  if (sequence > state.lastAllocatedSequence) {
    throw new GenericFailedPreconditionError('The rewound sequence cannot exceed the last allocated sequence');
  }
};

/* sequence advancement verifiers */

export const verifySequenceAdvancementNotAborted = (
  sequence: ConsensusLastSequence,
  advancedSequence: ConsensusLastSequence
): void => {
  if (advancedSequence < sequence) {
    throw new GenericAbortedError('Sequence advancement was aborted by a concurrent consensus change');
  }
};

export const verifyLeadershipSequenceAdvancementNotAborted = (
  state: ConsensusState,
  leadershipContext: ConsensusLeadershipContext,
  sequence: ConsensusLastSequence,
  advancedSequence: ConsensusLastSequence
): void => {
  if (
    state.currentEpoch !== leadershipContext.epoch ||
    state.leaderMasterId !== leadershipContext.leaderMasterId ||
    advancedSequence < sequence
  ) {
    throw new GenericAbortedError('Leadership sequence advancement was aborted by a concurrent consensus change');
  }
};

/* leadership verifiers */

export const verifyFollowershipAcceptable = (
  state: ConsensusState,
  leadershipContext: ConsensusLeadershipContext
): void => {
  if (
    state.currentEpoch === leadershipContext.epoch &&
    state.leaderMasterId !== null &&
    state.leaderMasterId !== leadershipContext.leaderMasterId
  ) {
    throw new GenericConflictError('This master node already belongs to a different leader');
  }

  if (state.currentEpoch > leadershipContext.epoch) {
    throw new GenericConflictError('The leader epoch is older than the local consensus epoch');
  }
};

export const verifyFollowershipAccepted = (
  state: ConsensusState,
  leadershipContext: ConsensusLeadershipContext
): void => {
  if (
    state.currentEpoch < leadershipContext.epoch ||
    state.leaderMasterId !== leadershipContext.leaderMasterId
  ) {
    throw new GenericConflictError('Another master node was accepted as the cluster leader first');
  }
};

export const verifyLeadershipReleased = (
  state: ConsensusState,
  leadershipContext: ConsensusLeadershipContext
): void => {
  if (
    state.currentEpoch === leadershipContext.epoch &&
    state.leaderMasterId === leadershipContext.leaderMasterId
  ) {
    throw new GenericAbortedError('Leadership release was aborted by a concurrent consensus change');
  }
};

/* election verifiers */

export const verifyElectionStarted = (
  state: ConsensusState,
  electionEpoch: ConsensusEpoch,
  candidateMasterNodeId: MasterNodeId
): void => {
  if (
    state.currentEpoch !== electionEpoch ||
    state.leaderMasterId !== null ||
    state.votedForMasterId !== candidateMasterNodeId
  ) {
    throw new GenericAbortedError('Election start was aborted by a concurrent consensus change');
  }
};

export const verifyElectionCompleted = (
  state: ConsensusState,
  epoch: ConsensusEpoch,
  candidateMasterNodeId: MasterNodeId
): void => {
  if (state.currentEpoch !== epoch || state.leaderMasterId !== candidateMasterNodeId) {
    throw new GenericAbortedError('Election completion was aborted by a concurrent consensus change');
  }
};

export const verifyEpochObserved = (state: ConsensusState, epoch: ConsensusEpoch): void => {
  if (state.currentEpoch < epoch) {
    throw new GenericAbortedError('Epoch observation was aborted by a concurrent consensus change');
  }
};

/* vote verifiers */

export const isCandidateLogUpToDate = (input: RequestConsensusVoteInput): boolean => {
  return (
    input.candidateLastLogEpoch > input.localLastLogEpoch ||
    (input.candidateLastLogEpoch === input.localLastLogEpoch &&
      input.candidateLastLogSequence >= input.localLastLogSequence)
  );
};
