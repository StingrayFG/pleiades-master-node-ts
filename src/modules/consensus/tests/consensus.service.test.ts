import type { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
  GenericAbortedError,
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

const state: ConsensusState = {
  id: CONSENSUS_STATE_ID,
  currentEpoch: 2n,
  leaderMasterId: selfMasterNodeId,
  lastAllocatedSequence: 4n,
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
  lastAllocatedSequence: -1n,
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
    withAdvancedLastAllocatedSequence: jest.fn<ConsensusStateRepositoryContract['withAdvancedLastAllocatedSequence']>(),
    withRewoundLastAllocatedSequence: jest.fn<ConsensusStateRepositoryContract['withRewoundLastAllocatedSequence']>(),
    claimLeadership: jest.fn<ConsensusStateRepositoryContract['claimLeadership']>(),
    acceptFollowership: jest.fn<ConsensusStateRepositoryContract['acceptFollowership']>()
  };

  repository.findState.mockResolvedValue(state);
  repository.createState.mockResolvedValue(state);
  repository.advanceLastCommittedSequence.mockResolvedValue(state);
  repository.advanceLastAppliedSequence.mockResolvedValue(state);
  repository.withAdvancedLastAllocatedSequence.mockImplementation(async (_id, _epoch, action) => {
    return action(transaction, 5n);
  });
  repository.withRewoundLastAllocatedSequence.mockImplementation(async (_id, _epoch, sequence, action) => {
    return action(transaction, sequence);
  });
  repository.claimLeadership.mockResolvedValue(true);
  repository.acceptFollowership.mockResolvedValue(true);

  return repository as unknown as jest.Mocked<ConsensusStateRepositoryContract>;
};

/* tests */

describe('ConsensusService', () => {
  let repository: jest.Mocked<ConsensusStateRepositoryContract>;
  let service: ConsensusService;

  beforeEach(() => {
    repository = createRepositoryMock();
    service = new ConsensusService(repository);
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

    await expect(service.advanceLastCommittedSequence(4n)).resolves.toBe(advancedState);
    expect(repository.advanceLastCommittedSequence).toHaveBeenCalledWith({
      id: CONSENSUS_STATE_ID,
      sequence: 4n
    });
  });

  test('rejects a committed sequence beyond the allocated sequence', async () => {
    await expect(service.advanceLastCommittedSequence(5n)).rejects.toBeInstanceOf(GenericFailedPreconditionError);
    expect(repository.advanceLastCommittedSequence).not.toHaveBeenCalled();
  });

  test('reports a committed-sequence concurrency gate loss', async () => {
    repository.advanceLastCommittedSequence.mockResolvedValue({
      ...state,
      lastAllocatedSequence: 3n
    });

    await expect(service.advanceLastCommittedSequence(4n)).rejects.toBeInstanceOf(GenericAbortedError);
  });

  test('advances the applied sequence up to the committed sequence', async () => {
    const advancedState = { ...state, lastAppliedSequence: 3n };

    repository.advanceLastAppliedSequence.mockResolvedValue(advancedState);

    await expect(service.advanceLastAppliedSequence(3n)).resolves.toBe(advancedState);
    expect(repository.advanceLastAppliedSequence).toHaveBeenCalledWith({
      id: CONSENSUS_STATE_ID,
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

    await expect(service.advanceLastAppliedSequence(3n)).rejects.toBeInstanceOf(GenericAbortedError);
  });

  test('delegates allocated-sequence work with the singleton id and expected epoch', async () => {
    const action = jest
      .fn<AllocatedSequenceTransactionAction<string>>()
      .mockImplementation(async (_tx, sequence) => `task-${sequence}`);

    await expect(service.withAdvancedLastAllocatedSequence(2n, action)).resolves.toBe('task-5');
    expect(repository.withAdvancedLastAllocatedSequence).toHaveBeenCalledWith(CONSENSUS_STATE_ID, 2n, action);
  });

  test('delegates an allowed allocated-sequence rewind through the singleton state', async () => {
    const action = jest
      .fn<RewoundSequenceTransactionAction<string>>()
      .mockImplementation(async (_tx, sequence) => `task-${sequence}`);

    await expect(service.withRewoundLastAllocatedSequence(2n, 3n, action)).resolves.toBe('task-3');
    expect(repository.withRewoundLastAllocatedSequence).toHaveBeenCalledWith(CONSENSUS_STATE_ID, 2n, 3n, action);
  });

  test('rejects rewinding the allocated sequence below committed history', async () => {
    const action = jest.fn<RewoundSequenceTransactionAction<void>>();

    await expect(service.withRewoundLastAllocatedSequence(2n, 2n, action)).rejects.toBeInstanceOf(
      GenericFailedPreconditionError
    );
    expect(repository.withRewoundLastAllocatedSequence).not.toHaveBeenCalled();
  });

  test('allows sequence-tail work at the current allocated sequence', async () => {
    const action = jest.fn<RewoundSequenceTransactionAction<void>>();

    await expect(service.withRewoundLastAllocatedSequence(2n, 4n, action)).resolves.toBeUndefined();
    expect(repository.withRewoundLastAllocatedSequence).toHaveBeenCalledWith(CONSENSUS_STATE_ID, 2n, 4n, action);
  });

  test('rejects a rewound sequence beyond the last allocated sequence', async () => {
    const action = jest.fn<RewoundSequenceTransactionAction<void>>();

    await expect(service.withRewoundLastAllocatedSequence(2n, 5n, action)).rejects.toBeInstanceOf(
      GenericFailedPreconditionError
    );
    expect(repository.withRewoundLastAllocatedSequence).not.toHaveBeenCalled();
  });

  test('returns immediately when this master node is already leader', async () => {
    await expect(service.bootstrapLeadership(selfMasterNodeId)).resolves.toBe(state);
    expect(repository.claimLeadership).not.toHaveBeenCalled();
    expect(repository.findState).toHaveBeenCalledTimes(1);
  });

  test('preserves another existing leader without attempting a claim', async () => {
    const otherLeaderState = { ...state, leaderMasterId: otherMasterNodeId };

    repository.findState.mockResolvedValue(otherLeaderState);

    await expect(service.bootstrapLeadership(selfMasterNodeId)).resolves.toBe(otherLeaderState);
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

    await expect(service.bootstrapLeadership(selfMasterNodeId)).resolves.toBe(leaderState);
    expect(repository.claimLeadership).toHaveBeenCalledWith({
      id: CONSENSUS_STATE_ID,
      epoch: 1n,
      leaderMasterId: selfMasterNodeId
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

    await expect(service.bootstrapLeadership(selfMasterNodeId)).resolves.toBe(winningState);
  });

  test('returns immediately when already following the requested leader', async () => {
    const followerState = { ...state, leaderMasterId: otherMasterNodeId };

    repository.findState.mockResolvedValue(followerState);

    await expect(service.acceptFollowership(otherMasterNodeId, followerState.currentEpoch)).resolves.toBe(
      followerState
    );
    expect(repository.acceptFollowership).not.toHaveBeenCalled();
  });

  test('accepts a leader and its epoch while the local consensus state is unclaimed', async () => {
    const followerState = {
      ...unclaimedState,
      currentEpoch: 2n,
      leaderMasterId: otherMasterNodeId,
      revision: 1n
    };

    repository.findState.mockResolvedValueOnce(unclaimedState).mockResolvedValueOnce(followerState);

    await expect(service.acceptFollowership(otherMasterNodeId, 2n)).resolves.toBe(followerState);
    expect(repository.acceptFollowership).toHaveBeenCalledWith({
      id: CONSENSUS_STATE_ID,
      epoch: 2n,
      leaderMasterId: otherMasterNodeId
    });
  });

  test('advances the epoch while continuing to follow the same leader', async () => {
    const existingFollowerState = {
      ...unclaimedState,
      currentEpoch: 1n,
      leaderMasterId: otherMasterNodeId
    };
    const advancedFollowerState = {
      ...existingFollowerState,
      currentEpoch: 2n,
      revision: 1n
    };

    repository.findState.mockResolvedValueOnce(existingFollowerState).mockResolvedValueOnce(advancedFollowerState);

    await expect(service.acceptFollowership(otherMasterNodeId, 2n)).resolves.toBe(advancedFollowerState);
    expect(repository.acceptFollowership).toHaveBeenCalledWith({
      id: CONSENSUS_STATE_ID,
      epoch: 2n,
      leaderMasterId: otherMasterNodeId
    });
  });

  test('rejects followership when already following a different leader', async () => {
    const followerState = { ...state, leaderMasterId: 'master-node-c' };

    repository.findState.mockResolvedValue(followerState);

    await expect(service.acceptFollowership(otherMasterNodeId, 2n)).rejects.toBeInstanceOf(GenericConflictError);
    expect(repository.acceptFollowership).not.toHaveBeenCalled();
  });

  test('rejects a leader epoch older than an unclaimed local epoch', async () => {
    repository.findState.mockResolvedValue({
      ...unclaimedState,
      currentEpoch: 3n
    });

    await expect(service.acceptFollowership(otherMasterNodeId, 2n)).rejects.toBeInstanceOf(GenericConflictError);
    expect(repository.acceptFollowership).not.toHaveBeenCalled();
  });

  test('rejects a stale epoch from the current leader', async () => {
    repository.findState.mockResolvedValue({
      ...state,
      leaderMasterId: otherMasterNodeId
    });

    await expect(service.acceptFollowership(otherMasterNodeId, 1n)).rejects.toBeInstanceOf(GenericConflictError);
    expect(repository.acceptFollowership).not.toHaveBeenCalled();
  });

  test('rejects followership when another leader wins the acceptance race', async () => {
    const winningState = { ...unclaimedState, leaderMasterId: 'master-node-c' };

    repository.findState.mockResolvedValueOnce(unclaimedState).mockResolvedValueOnce(winningState);
    repository.acceptFollowership.mockResolvedValue(false);

    await expect(service.acceptFollowership(otherMasterNodeId, 2n)).rejects.toBeInstanceOf(GenericConflictError);
  });
});
