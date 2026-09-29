import { describe, expect, test } from '@jest/globals';

import { GenericAbortedError, GenericConflictError, GenericFailedPreconditionError } from '@/errors/application.errors';

import type { ConsensusLeadershipContext } from '../consensus.application';
import { CONSENSUS_STATE_ID, type ConsensusState } from '../consensus.domain';
import {
  isCandidateLogUpToDate,
  verifyAppliedSequenceWithinCommitted,
  verifyCommittedSequenceWithinAllocated,
  verifyElectionCompleted,
  verifyElectionStarted,
  verifyEpochObserved,
  verifyFollowershipAcceptable,
  verifyFollowershipAccepted,
  verifyLeadershipSequenceAdvancementNotAborted,
  verifyLeadershipReleased,
  verifyMatchedSequenceWithinAllocated,
  verifySequenceAdvancementNotAborted,
  verifySequenceWithinRewindBounds
} from '../consensus.verifiers';

/* fixtures */

const now = new Date('2026-01-01T00:00:00.000Z');

const consensusState: ConsensusState = {
  id: CONSENSUS_STATE_ID,
  currentEpoch: 2n,
  leaderMasterId: 'master-node-a',
  votedForMasterId: 'master-node-a',
  lastLeaderContactAt: now,
  lastAllocatedSequence: 5n,
  lastMatchedSequence: 4n,
  lastCommittedSequence: 3n,
  lastAppliedSequence: 3n,
  createdAt: now,
  updatedAt: now,
  revision: 1n
};

const leadershipContext: ConsensusLeadershipContext = {
  epoch: consensusState.currentEpoch,
  leaderMasterId: 'master-node-a'
};

/* tests */

describe('verifyCommittedSequenceWithinAllocated', () => {
  test('accepts committed sequences within the allocated sequence', () => {
    expect(() => verifyCommittedSequenceWithinAllocated(consensusState, 5n)).not.toThrow();
  });

  test('rejects committed sequences beyond the allocated sequence', () => {
    expect(() => verifyCommittedSequenceWithinAllocated(consensusState, 6n)).toThrow(
      'Cannot advance the committed sequence beyond the last allocated sequence'
    );
  });
});

describe('verifyAppliedSequenceWithinCommitted', () => {
  test('accepts applied sequences within the committed sequence', () => {
    expect(() => verifyAppliedSequenceWithinCommitted(consensusState, 3n)).not.toThrow();
  });

  test('rejects applied sequences beyond the committed sequence', () => {
    expect(() => verifyAppliedSequenceWithinCommitted(consensusState, 4n)).toThrow(
      'Cannot advance the applied sequence beyond the last committed sequence'
    );
  });
});

describe('verifyMatchedSequenceWithinAllocated', () => {
  test('accepts matched sequences within the allocated sequence', () => {
    expect(() => verifyMatchedSequenceWithinAllocated(consensusState, 5n)).not.toThrow();
  });

  test('rejects matched sequences beyond the allocated sequence', () => {
    expect(() => verifyMatchedSequenceWithinAllocated(consensusState, 6n)).toThrow(
      'Cannot advance the matched sequence beyond the last allocated sequence'
    );
  });
});

describe('verifySequenceWithinRewindBounds', () => {
  test('accepts sequences between the committed and allocated sequences', () => {
    expect(() => verifySequenceWithinRewindBounds(consensusState, 3n)).not.toThrow();
    expect(() => verifySequenceWithinRewindBounds(consensusState, 5n)).not.toThrow();
  });

  test('rejects sequences outside the rewind bounds', () => {
    expect(() => verifySequenceWithinRewindBounds(consensusState, 2n)).toThrow(GenericFailedPreconditionError);
    expect(() => verifySequenceWithinRewindBounds(consensusState, 6n)).toThrow(GenericFailedPreconditionError);
  });
});

describe('verifySequenceAdvancementNotAborted', () => {
  test('accepts a sequence advancement that reached the requested sequence', () => {
    expect(() => verifySequenceAdvancementNotAborted(3n, 3n)).not.toThrow();
    expect(() => verifySequenceAdvancementNotAborted(3n, 4n)).not.toThrow();
  });

  test('rejects a sequence advancement that stayed behind', () => {
    expect(() => verifySequenceAdvancementNotAborted(4n, 3n)).toThrow(
      'Sequence advancement was aborted by a concurrent consensus change'
    );
  });
});

describe('verifyLeadershipSequenceAdvancementNotAborted', () => {
  test('accepts a sequence advancement matching the leadership context', () => {
    expect(() =>
      verifyLeadershipSequenceAdvancementNotAborted(consensusState, leadershipContext, 5n, 5n)
    ).not.toThrow();
  });

  test('rejects a sequence advancement after a leadership change', () => {
    expect(() =>
      verifyLeadershipSequenceAdvancementNotAborted(
        { ...consensusState, currentEpoch: 3n },
        leadershipContext,
        5n,
        5n
      )
    ).toThrow('Leadership sequence advancement was aborted by a concurrent consensus change');
    expect(() =>
      verifyLeadershipSequenceAdvancementNotAborted(
        { ...consensusState, leaderMasterId: 'master-node-b' },
        leadershipContext,
        5n,
        5n
      )
    ).toThrow('Leadership sequence advancement was aborted by a concurrent consensus change');
  });

  test('rejects a sequence advancement that stayed behind', () => {
    expect(() =>
      verifyLeadershipSequenceAdvancementNotAborted(consensusState, leadershipContext, 6n, 5n)
    ).toThrow('Leadership sequence advancement was aborted by a concurrent consensus change');
  });
});

describe('verifyFollowershipAcceptable', () => {
  test('accepts the same leader in the same epoch', () => {
    expect(() => verifyFollowershipAcceptable(consensusState, 'master-node-a', 2n)).not.toThrow();
  });

  test('accepts a leader claim while no leader exists', () => {
    expect(() =>
      verifyFollowershipAcceptable({ ...consensusState, leaderMasterId: null }, 'master-node-b', 2n)
    ).not.toThrow();
  });

  test('rejects a different leader in the same epoch', () => {
    expect(() => verifyFollowershipAcceptable(consensusState, 'master-node-b', 2n)).toThrow(GenericConflictError);
  });

  test('rejects a leader epoch older than the local consensus epoch', () => {
    expect(() => verifyFollowershipAcceptable(consensusState, 'master-node-a', 1n)).toThrow(GenericConflictError);
  });
});

describe('verifyFollowershipAccepted', () => {
  test('accepts followership under the requested leader and epoch', () => {
    expect(() => verifyFollowershipAccepted(consensusState, 'master-node-a', 2n)).not.toThrow();
  });

  test('rejects followership claimed by another leader first', () => {
    expect(() =>
      verifyFollowershipAccepted({ ...consensusState, leaderMasterId: 'master-node-b' }, 'master-node-a', 2n)
    ).toThrow(GenericConflictError);
  });

  test('rejects followership left behind by a newer epoch', () => {
    expect(() => verifyFollowershipAccepted(consensusState, 'master-node-a', 3n)).toThrow(GenericConflictError);
  });
});

describe('verifyLeadershipReleased', () => {
  test('accepts a state where leadership moved on', () => {
    expect(() =>
      verifyLeadershipReleased({ ...consensusState, leaderMasterId: null }, 'master-node-a', 2n)
    ).not.toThrow();
  });

  test('rejects a state where the leader still holds the epoch', () => {
    expect(() => verifyLeadershipReleased(consensusState, 'master-node-a', 2n)).toThrow(GenericAbortedError);
  });
});

describe('verifyElectionStarted', () => {
  const electionState: ConsensusState = {
    ...consensusState,
    currentEpoch: 3n,
    leaderMasterId: null,
    votedForMasterId: 'master-node-b',
    lastLeaderContactAt: null
  };

  test('accepts a started election voting for the candidate', () => {
    expect(() => verifyElectionStarted(electionState, 3n, 'master-node-b')).not.toThrow();
  });

  test('rejects election states missing the expected epoch, vacancy, or vote', () => {
    expect(() => verifyElectionStarted(electionState, 2n, 'master-node-b')).toThrow(GenericAbortedError);
    expect(() =>
      verifyElectionStarted({ ...electionState, leaderMasterId: 'master-node-c' }, 3n, 'master-node-b')
    ).toThrow(GenericAbortedError);
    expect(() =>
      verifyElectionStarted({ ...electionState, votedForMasterId: 'master-node-c' }, 3n, 'master-node-b')
    ).toThrow(GenericAbortedError);
  });
});

describe('verifyElectionCompleted', () => {
  test('accepts a completed election under the candidate', () => {
    expect(() => verifyElectionCompleted(consensusState, 2n, 'master-node-a')).not.toThrow();
  });

  test('rejects election states missing the expected epoch or leader', () => {
    expect(() => verifyElectionCompleted(consensusState, 3n, 'master-node-a')).toThrow(GenericAbortedError);
    expect(() => verifyElectionCompleted(consensusState, 2n, 'master-node-b')).toThrow(GenericAbortedError);
  });
});

describe('verifyEpochObserved', () => {
  test('accepts an observed epoch', () => {
    expect(() => verifyEpochObserved(consensusState, 2n)).not.toThrow();
  });

  test('rejects an epoch that was not observed', () => {
    expect(() => verifyEpochObserved(consensusState, 3n)).toThrow(GenericAbortedError);
  });
});

describe('isCandidateLogUpToDate', () => {
  test.each([
    [{ candidateLastLogEpoch: 3n, candidateLastLogSequence: 1n }, true],
    [{ candidateLastLogEpoch: 2n, candidateLastLogSequence: 5n }, true],
    [{ candidateLastLogEpoch: 2n, candidateLastLogSequence: 4n }, true],
    [{ candidateLastLogEpoch: 2n, candidateLastLogSequence: 3n }, false],
    [{ candidateLastLogEpoch: 1n, candidateLastLogSequence: 9n }, false]
  ])('compares candidate and local log positions', (positions, expected) => {
    expect(
      isCandidateLogUpToDate({
        epoch: 3n,
        candidateMasterNodeId: 'master-node-b',
        localLastLogEpoch: 2n,
        localLastLogSequence: 4n,
        ...positions
      })
    ).toBe(expected);
  });
});
