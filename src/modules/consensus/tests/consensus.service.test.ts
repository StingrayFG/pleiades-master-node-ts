import type { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
  GenericAlreadyExistsError,
  GenericConflictError,
  GenericFailedPreconditionError,
  GenericInternalServerError
} from '@/errors/application.errors';

import type { AllocatedSequenceTransactionAction, RewoundSequenceTransactionAction } from '../consensus.application';
import { CONSENSUS_STATE_ID, type ConsensusState } from '../consensus.domain';
import type { ConsensusStateRepositoryContract } from '../consensus.repository';
import { ConsensusService } from '../consensus.service';

/* fixtures */

const now = new Date('2026-01-01T00:00:00.000Z');
const selfMasterNodeId = 'master-node-a';
const otherMasterNodeId = 'master-node-b';
const leadershipContext = {
  epoch: 2n,
  leaderMasterId: selfMasterNodeId
};

const state: ConsensusState = {
  id: CONSENSUS_STATE_ID,
  currentEpoch: 2n,
  leaderMasterId: selfMasterNodeId,
  votedForMasterId: selfMasterNodeId,
  lastLeaderContactAt: now,

  lastAllocatedSequence: 4n,
  lastMatchedSequence: 3n,
  lastCommittedSequence: 3n,
  lastAppliedSequence: 2n,
  createdAt: now,
  updatedAt: now,
  revision: 5n
};

const unclaimedState: ConsensusState = {
  ...state,
  currentEpoch: 0n,
  leaderMasterId: null,
  votedForMasterId: null,
  lastLeaderContactAt: null,
  lastAllocatedSequence: -1n,
  lastMatchedSequence: -1n,
  lastCommittedSequence: -1n,
  lastAppliedSequence: -1n,
  revision: 0n
};

/* mocks */

const createRepositoryMock = (): jest.Mocked<ConsensusStateRepositoryContract> => {
  const transaction = {} as Prisma.TransactionClient;
  const repository = {
    findState: jest.fn<ConsensusStateRepositoryContract['findState']>(),
    createState: jest.fn<ConsensusStateRepositoryContract['createState']>(),
    advanceLastCommittedSequence: jest.fn<ConsensusStateRepositoryContract['advanceLastCommittedSequence']>(),
    advanceLastAppliedSequence: jest.fn<ConsensusStateRepositoryContract['advanceLastAppliedSequence']>(),
    advanceLastAllocatedSequence: jest.fn<ConsensusStateRepositoryContract['advanceLastAllocatedSequence']>(),
    advanceLastMatchedSequence: jest.fn<ConsensusStateRepositoryContract['advanceLastMatchedSequence']>(),
    withAdvancedLastAllocatedSequence: jest.fn<ConsensusStateRepositoryContract['withAdvancedLastAllocatedSequence']>(),
    withRewoundLastAllocatedSequence: jest.fn<ConsensusStateRepositoryContract['withRewoundLastAllocatedSequence']>(),
    claimLeadership: jest.fn<ConsensusStateRepositoryContract['claimLeadership']>(),
    acceptFollowership: jest.fn<ConsensusStateRepositoryContract['acceptFollowership']>(),
    releaseLeadership: jest.fn<ConsensusStateRepositoryContract['releaseLeadership']>(),
    startElection: jest.fn<ConsensusStateRepositoryContract['startElection']>(),
    adoptNewerEpoch: jest.fn<ConsensusStateRepositoryContract['adoptNewerEpoch']>(),
    applyVoteRequest: jest.fn<ConsensusStateRepositoryContract['applyVoteRequest']>()
  };

  repository.findState.mockResolvedValue(state);
  repository.createState.mockResolvedValue(state);
  repository.advanceLastCommittedSequence.mockResolvedValue(state);
  repository.advanceLastAppliedSequence.mockResolvedValue(state);
  repository.advanceLastAllocatedSequence.mockResolvedValue(state);
  repository.advanceLastMatchedSequence.mockResolvedValue(state);
  repository.withAdvancedLastAllocatedSequence.mockImplementation(async (_input, action) => {
    return action(transaction, 5n);
  });
  repository.withRewoundLastAllocatedSequence.mockImplementation(async (input, action) => {
    return action(transaction, input.sequence);
  });
  repository.claimLeadership.mockResolvedValue(true);
  repository.acceptFollowership.mockResolvedValue(true);
  repository.releaseLeadership.mockResolvedValue(true);
  repository.startElection.mockResolvedValue({
    ...unclaimedState,
    currentEpoch: 1n,
    votedForMasterId: selfMasterNodeId,
    revision: 1n
  });
  repository.adoptNewerEpoch.mockResolvedValue({ ...unclaimedState, currentEpoch: 3n, revision: 1n });
  repository.applyVoteRequest.mockResolvedValue({ state, voteGranted: true });

  return repository as unknown as jest.Mocked<ConsensusStateRepositoryContract>;
};

/* tests */

describe('ConsensusService', () => {
  let repository: jest.Mocked<ConsensusStateRepositoryContract>;
  let service: ConsensusService;

  beforeEach(() => {
    repository = createRepositoryMock();
    service = new ConsensusService(repository, selfMasterNodeId);
  });

  test('returns an existing consensus state without creating another one', async () => {
    await expect(service.getConsensusState()).resolves.toBe(state);
    expect(repository.findState).toHaveBeenCalledWith();
    expect(repository.createState).not.toHaveBeenCalled();
  });

  test('creates the consensus state when it does not exist', async () => {
    repository.findState.mockResolvedValue(null);

    await expect(service.getConsensusState()).resolves.toBe(state);
    expect(repository.createState).toHaveBeenCalledWith();
  });

  test('returns a concurrently created state after losing the initialization race', async () => {
    const creationError = new GenericAlreadyExistsError('Consensus state already exists');

    repository.findState.mockResolvedValueOnce(null).mockResolvedValueOnce(state);
    repository.createState.mockRejectedValue(creationError);

    await expect(service.getConsensusState()).resolves.toBe(state);
    expect(repository.findState).toHaveBeenCalledTimes(2);
  });

  test('preserves the initialization race error when the created state cannot be read', async () => {
    const creationError = new GenericAlreadyExistsError('Consensus state already exists');

    repository.findState.mockResolvedValue(null);
    repository.createState.mockRejectedValue(creationError);

    await expect(service.getConsensusState()).rejects.toBe(creationError);
    expect(repository.findState).toHaveBeenCalledTimes(2);
  });

  test('propagates non-duplicate state creation errors without retrying the read', async () => {
    const creationError = new GenericInternalServerError('Database unavailable');

    repository.findState.mockResolvedValue(null);
    repository.createState.mockRejectedValue(creationError);

    await expect(service.getConsensusState()).rejects.toBe(creationError);
    expect(repository.findState).toHaveBeenCalledTimes(1);
  });

  test('initializes state and advances the committed sequence', async () => {
    const advancedState = { ...state, lastCommittedSequence: 4n };

    repository.advanceLastCommittedSequence.mockResolvedValue(advancedState);

    await expect(service.advanceLastCommittedSequence(4n, leadershipContext)).resolves.toBe(advancedState);
    expect(repository.advanceLastCommittedSequence).toHaveBeenCalledWith({
      sequence: 4n,
      leadershipContext
    });
  });

  test('rejects a committed sequence beyond the allocated sequence', async () => {
    await expect(service.advanceLastCommittedSequence(5n, leadershipContext)).rejects.toBeInstanceOf(
      GenericFailedPreconditionError
    );
    expect(repository.advanceLastCommittedSequence).not.toHaveBeenCalled();
  });

  test('reports a committed-sequence concurrency gate loss', async () => {
    repository.advanceLastCommittedSequence.mockResolvedValue({
      ...state,
      lastAllocatedSequence: 3n
    });

    await expect(service.advanceLastCommittedSequence(4n, leadershipContext)).rejects.toThrow(
      'Committed sequence advancement was aborted by a concurrent consensus change'
    );
  });

  test('rejects committed-sequence advancement after leadership is lost in the same epoch', async () => {
    repository.advanceLastCommittedSequence.mockResolvedValue({
      ...state,
      leaderMasterId: null,
      lastLeaderContactAt: null,
      lastCommittedSequence: 4n
    });

    await expect(service.advanceLastCommittedSequence(4n, leadershipContext)).rejects.toThrow(
      'Committed sequence advancement was aborted by a concurrent consensus change'
    );
  });

  test('advances the applied sequence up to the committed sequence', async () => {
    const advancedState = { ...state, lastAppliedSequence: 3n };

    repository.advanceLastAppliedSequence.mockResolvedValue(advancedState);

    await expect(service.advanceLastAppliedSequence(3n)).resolves.toBe(advancedState);
    expect(repository.advanceLastAppliedSequence).toHaveBeenCalledWith({
      sequence: 3n
    });
  });

  test('rejects an applied sequence beyond the committed sequence', async () => {
    await expect(service.advanceLastAppliedSequence(4n)).rejects.toBeInstanceOf(GenericFailedPreconditionError);
    expect(repository.advanceLastAppliedSequence).not.toHaveBeenCalled();
  });

  test('reports an applied-sequence concurrency gate loss', async () => {
    repository.advanceLastAppliedSequence.mockResolvedValue({
      ...state,
      lastAppliedSequence: 2n
    });

    await expect(service.advanceLastAppliedSequence(3n)).rejects.toThrow(
      'Applied sequence advancement was aborted by a concurrent consensus change'
    );
  });

  test('advances the allocated sequence under the expected leadership state', async () => {
    const advancedState = { ...state, lastAllocatedSequence: 5n };

    repository.advanceLastAllocatedSequence.mockResolvedValue(advancedState);

    await expect(service.advanceLastAllocatedSequence(5n, leadershipContext)).resolves.toBe(advancedState);
    expect(repository.advanceLastAllocatedSequence).toHaveBeenCalledWith({
      sequence: 5n,
      leadershipContext
    });
  });

  test('reports allocated-sequence advancement after leadership is lost', async () => {
    repository.advanceLastAllocatedSequence.mockResolvedValue({
      ...state,
      leaderMasterId: null,
      lastLeaderContactAt: null
    });

    await expect(service.advanceLastAllocatedSequence(5n, leadershipContext)).rejects.toThrow(
      'Allocated sequence advancement was aborted by a concurrent consensus change'
    );
  });

  test('advances the matched sequence under the expected leadership state', async () => {
    const advancedState = { ...state, lastMatchedSequence: 4n };

    repository.advanceLastMatchedSequence.mockResolvedValue(advancedState);

    await expect(service.advanceLastMatchedSequence(4n, leadershipContext)).resolves.toBe(advancedState);
    expect(repository.advanceLastMatchedSequence).toHaveBeenCalledWith({
      sequence: 4n,
      leadershipContext
    });
  });

  test('rejects a matched sequence beyond the allocated sequence', async () => {
    await expect(service.advanceLastMatchedSequence(5n, leadershipContext)).rejects.toBeInstanceOf(
      GenericFailedPreconditionError
    );
    expect(repository.advanceLastMatchedSequence).not.toHaveBeenCalled();
  });

  test('reports a matched-sequence concurrency gate loss', async () => {
    repository.advanceLastMatchedSequence.mockResolvedValue({
      ...state,
      lastMatchedSequence: 3n
    });

    await expect(service.advanceLastMatchedSequence(4n, leadershipContext)).rejects.toThrow(
      'Matched sequence advancement was aborted by a concurrent consensus change'
    );
  });

  test('rejects matched-sequence advancement after leadership is lost in the same epoch', async () => {
    repository.advanceLastMatchedSequence.mockResolvedValue({
      ...state,
      leaderMasterId: null,
      lastLeaderContactAt: null,
      lastMatchedSequence: 4n
    });

    await expect(service.advanceLastMatchedSequence(4n, leadershipContext)).rejects.toThrow(
      'Matched sequence advancement was aborted by a concurrent consensus change'
    );
  });

  test('delegates allocated-sequence work with the singleton id and expected leadership state', async () => {
    const action = jest
      .fn<AllocatedSequenceTransactionAction<string>>()
      .mockImplementation(async (_tx, sequence) => `task-${sequence}`);

    await expect(service.withAdvancedLastAllocatedSequence(leadershipContext, action)).resolves.toBe('task-5');
    expect(repository.withAdvancedLastAllocatedSequence).toHaveBeenCalledWith(
      {
        leadershipContext: {
          epoch: 2n,
          leaderMasterId: selfMasterNodeId
        }
      },
      action
    );
  });

  test('delegates an allowed allocated-sequence rewind through the singleton state', async () => {
    const action = jest
      .fn<RewoundSequenceTransactionAction<string>>()
      .mockImplementation(async (_tx, sequence) => `task-${sequence}`);

    await expect(service.withRewoundLastAllocatedSequence(leadershipContext, 3n, action)).resolves.toBe('task-3');
    expect(repository.withRewoundLastAllocatedSequence).toHaveBeenCalledWith(
      {
        sequence: 3n,
        leadershipContext
      },
      action
    );
  });

  test('rejects rewinding the allocated sequence below committed history', async () => {
    const action = jest.fn<RewoundSequenceTransactionAction<void>>();

    await expect(service.withRewoundLastAllocatedSequence(leadershipContext, 2n, action)).rejects.toBeInstanceOf(
      GenericFailedPreconditionError
    );
    expect(repository.withRewoundLastAllocatedSequence).not.toHaveBeenCalled();
  });

  test('allows sequence-tail work at the current allocated sequence', async () => {
    const action = jest.fn<RewoundSequenceTransactionAction<void>>();

    await expect(service.withRewoundLastAllocatedSequence(leadershipContext, 4n, action)).resolves.toBeUndefined();
    expect(repository.withRewoundLastAllocatedSequence).toHaveBeenCalledWith(
      {
        sequence: 4n,
        leadershipContext
      },
      action
    );
  });

  test('rejects a rewound sequence beyond the last allocated sequence', async () => {
    const action = jest.fn<RewoundSequenceTransactionAction<void>>();

    await expect(service.withRewoundLastAllocatedSequence(leadershipContext, 5n, action)).rejects.toBeInstanceOf(
      GenericFailedPreconditionError
    );
    expect(repository.withRewoundLastAllocatedSequence).not.toHaveBeenCalled();
  });

  test('returns immediately when this master node is already leader', async () => {
    await expect(service.claimInitialLeadership(selfMasterNodeId)).resolves.toBe(state);
    expect(repository.claimLeadership).not.toHaveBeenCalled();
    expect(repository.findState).toHaveBeenCalledTimes(1);
  });

  test('preserves another existing leader without attempting a claim', async () => {
    const otherLeaderState = { ...state, leaderMasterId: otherMasterNodeId };

    repository.findState.mockResolvedValue(otherLeaderState);

    await expect(service.claimInitialLeadership(selfMasterNodeId)).resolves.toBe(otherLeaderState);
    expect(repository.claimLeadership).not.toHaveBeenCalled();
  });

  test('claims the next epoch and returns the resulting leadership state', async () => {
    const leaderState = {
      ...unclaimedState,
      currentEpoch: 1n,
      leaderMasterId: selfMasterNodeId,
      revision: 1n
    };

    repository.findState.mockResolvedValueOnce(unclaimedState).mockResolvedValueOnce(leaderState);

    await expect(service.claimInitialLeadership(selfMasterNodeId)).resolves.toBe(leaderState);
    expect(repository.claimLeadership).toHaveBeenCalledWith({
      leadershipContext: {
        epoch: 1n,
        leaderMasterId: selfMasterNodeId
      },
      lastLeaderContactAt: expect.any(Date),
      matchedSequence: -1n
    });
    expect(repository.findState).toHaveBeenCalledTimes(2);
  });

  test('returns the actual winner after losing a concurrent leadership claim', async () => {
    const winningState = {
      ...unclaimedState,
      currentEpoch: 1n,
      leaderMasterId: otherMasterNodeId,
      revision: 1n
    };

    repository.findState.mockResolvedValueOnce(unclaimedState).mockResolvedValueOnce(winningState);
    repository.claimLeadership.mockResolvedValue(false);

    await expect(service.claimInitialLeadership(selfMasterNodeId)).resolves.toBe(winningState);
  });

  test('refreshes leader contact when already following the requested leader', async () => {
    const followerState = { ...state, leaderMasterId: otherMasterNodeId, lastMatchedSequence: 4n };

    repository.findState.mockResolvedValue(followerState);

    await expect(
      service.acceptFollowership({
        epoch: followerState.currentEpoch,
        leaderMasterId: otherMasterNodeId
      })
    ).resolves.toBe(followerState);
    expect(repository.acceptFollowership).toHaveBeenCalledWith({
      leadershipContext: {
        epoch: followerState.currentEpoch,
        leaderMasterId: otherMasterNodeId
      },
      lastLeaderContactAt: expect.any(Date),
      matchedSequence: 4n
    });
  });

  test('accepts a leader and its epoch while the local consensus state is unclaimed', async () => {
    const preAcceptanceState = {
      ...unclaimedState,
      lastAllocatedSequence: 3n,
      lastMatchedSequence: 3n,
      lastCommittedSequence: 2n
    };
    const followerState = {
      ...preAcceptanceState,
      currentEpoch: 2n,
      leaderMasterId: otherMasterNodeId,
      lastMatchedSequence: 2n,
      revision: 1n
    };

    repository.findState.mockResolvedValueOnce(preAcceptanceState).mockResolvedValueOnce(followerState);

    await expect(
      service.acceptFollowership({ epoch: 2n, leaderMasterId: otherMasterNodeId })
    ).resolves.toBe(followerState);
    expect(repository.acceptFollowership).toHaveBeenCalledWith({
      leadershipContext: {
        epoch: 2n,
        leaderMasterId: otherMasterNodeId
      },
      lastLeaderContactAt: expect.any(Date),
      matchedSequence: 2n
    });
  });

  test('advances the epoch while continuing to follow the same leader', async () => {
    const existingFollowerState = {
      ...unclaimedState,
      currentEpoch: 1n,
      leaderMasterId: otherMasterNodeId,
      lastAllocatedSequence: 3n,
      lastMatchedSequence: 3n,
      lastCommittedSequence: 2n
    };
    const advancedFollowerState = {
      ...existingFollowerState,
      currentEpoch: 2n,
      lastMatchedSequence: 2n,
      revision: 1n
    };

    repository.findState.mockResolvedValueOnce(existingFollowerState).mockResolvedValueOnce(advancedFollowerState);

    await expect(
      service.acceptFollowership({ epoch: 2n, leaderMasterId: otherMasterNodeId })
    ).resolves.toBe(advancedFollowerState);
    expect(repository.acceptFollowership).toHaveBeenCalledWith({
      leadershipContext: {
        epoch: 2n,
        leaderMasterId: otherMasterNodeId
      },
      lastLeaderContactAt: expect.any(Date),
      matchedSequence: 2n
    });
  });

  test('rejects followership when already following a different leader', async () => {
    const followerState = { ...state, leaderMasterId: 'master-node-c' };

    repository.findState.mockResolvedValue(followerState);

    await expect(
      service.acceptFollowership({ epoch: 2n, leaderMasterId: otherMasterNodeId })
    ).rejects.toBeInstanceOf(GenericConflictError);
    expect(repository.acceptFollowership).not.toHaveBeenCalled();
  });

  test('rejects a leader epoch older than an unclaimed local epoch', async () => {
    repository.findState.mockResolvedValue({
      ...unclaimedState,
      currentEpoch: 3n
    });

    await expect(
      service.acceptFollowership({ epoch: 2n, leaderMasterId: otherMasterNodeId })
    ).rejects.toBeInstanceOf(GenericConflictError);
    expect(repository.acceptFollowership).not.toHaveBeenCalled();
  });

  test('rejects a stale epoch from the current leader', async () => {
    repository.findState.mockResolvedValue({
      ...state,
      leaderMasterId: otherMasterNodeId
    });

    await expect(
      service.acceptFollowership({ epoch: 1n, leaderMasterId: otherMasterNodeId })
    ).rejects.toBeInstanceOf(GenericConflictError);
    expect(repository.acceptFollowership).not.toHaveBeenCalled();
  });

  test('rejects followership when another leader wins the acceptance race', async () => {
    const winningState = { ...unclaimedState, leaderMasterId: 'master-node-c' };

    repository.findState.mockResolvedValueOnce(unclaimedState).mockResolvedValueOnce(winningState);
    repository.acceptFollowership.mockResolvedValue(false);

    await expect(
      service.acceptFollowership({ epoch: 2n, leaderMasterId: otherMasterNodeId })
    ).rejects.toBeInstanceOf(GenericConflictError);
  });

  test('conditionally releases local leadership at the expected epoch', async () => {
    const releasedState = {
      ...state,
      leaderMasterId: null,
      lastLeaderContactAt: null,
      revision: 6n
    };

    repository.findState.mockResolvedValueOnce(state).mockResolvedValueOnce(releasedState);

    await expect(service.releaseLeadership(leadershipContext)).resolves.toBe(releasedState);
    expect(repository.releaseLeadership).toHaveBeenCalledWith({
      leadershipContext: {
        epoch: 2n,
        leaderMasterId: selfMasterNodeId
      },
      matchedSequence: 3n
    });
  });

  test('starts a new epoch and records the local candidate vote', async () => {
    repository.findState.mockResolvedValue(unclaimedState);

    await expect(service.startElection()).resolves.toEqual({
      ...unclaimedState,
      currentEpoch: 1n,
      votedForMasterId: selfMasterNodeId,
      revision: 1n
    });
    expect(repository.startElection).toHaveBeenCalledWith({
      expectedEpoch: 0n,
      electionEpoch: 1n,
      candidateMasterNodeId: selfMasterNodeId,
      matchedSequence: -1n
    });
  });

  test('grants votes only when the candidate log is at least as current', async () => {
    await service.requestVote({
      epoch: 3n,
      candidateMasterNodeId: otherMasterNodeId,
      candidateLastLogEpoch: 2n,
      candidateLastLogSequence: 4n,
      localLastLogEpoch: 2n,
      localLastLogSequence: 3n
    });

    expect(repository.applyVoteRequest).toHaveBeenCalledWith({
      epoch: 3n,
      candidateMasterNodeId: otherMasterNodeId,
      candidateLogIsUpToDate: true
    });

    await service.requestVote({
      epoch: 3n,
      candidateMasterNodeId: otherMasterNodeId,
      candidateLastLogEpoch: 1n,
      candidateLastLogSequence: 10n,
      localLastLogEpoch: 2n,
      localLastLogSequence: 3n
    });

    expect(repository.applyVoteRequest).toHaveBeenLastCalledWith({
      epoch: 3n,
      candidateMasterNodeId: otherMasterNodeId,
      candidateLogIsUpToDate: false
    });
  });

  test('adopts a newer epoch and clears leadership through the repository', async () => {
    repository.findState.mockResolvedValue(unclaimedState);

    await expect(service.adoptNewerEpoch(3n)).resolves.toEqual({
      ...unclaimedState,
      currentEpoch: 3n,
      revision: 1n
    });
    expect(repository.adoptNewerEpoch).toHaveBeenCalledWith({
      epoch: 3n,
      matchedSequence: -1n
    });
  });

});
