import type { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
  GenericAlreadyExistsError,
  GenericFailedPreconditionError,
  GenericInternalServerError
} from '@/errors/application.errors';

import type { AllocatedSequenceTransactionAction } from '../consensus.application';
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
    withAdvancedLastAllocatedSequence: jest.fn<ConsensusStateRepositoryContract['withAdvancedLastAllocatedSequence']>(),
    claimLeadership: jest.fn<ConsensusStateRepositoryContract['claimLeadership']>()
  };

  repository.findState.mockResolvedValue(state);
  repository.createState.mockResolvedValue(state);
  repository.advanceLastCommittedSequence.mockResolvedValue(state);
  repository.advanceLastAppliedSequence.mockResolvedValue(state);
  repository.withAdvancedLastAllocatedSequence.mockImplementation(async (_id, _epoch, action) => {
    return action(transaction, 5n);
  });
  repository.claimLeadership.mockResolvedValue(true);

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
    await expect(service.advanceLastCommittedSequence(4n)).resolves.toBe(state);
    expect(repository.advanceLastCommittedSequence).toHaveBeenCalledWith({
      id: CONSENSUS_STATE_ID,
      sequence: 4n
    });
  });

  test('advances the applied sequence up to the committed sequence', async () => {
    await expect(service.advanceLastAppliedSequence(3n)).resolves.toBe(state);
    expect(repository.advanceLastAppliedSequence).toHaveBeenCalledWith({
      id: CONSENSUS_STATE_ID,
      sequence: 3n
    });
  });

  test('rejects an applied sequence beyond the committed sequence', async () => {
    await expect(service.advanceLastAppliedSequence(4n)).rejects.toBeInstanceOf(GenericFailedPreconditionError);
    expect(repository.advanceLastAppliedSequence).not.toHaveBeenCalled();
  });

  test('delegates allocated-sequence work with the singleton id and expected epoch', async () => {
    const action = jest
      .fn<AllocatedSequenceTransactionAction<string>>()
      .mockImplementation(async (_tx, sequence) => `task-${sequence}`);

    await expect(service.withAdvancedLastAllocatedSequence(2n, action)).resolves.toBe('task-5');
    expect(repository.withAdvancedLastAllocatedSequence).toHaveBeenCalledWith(CONSENSUS_STATE_ID, 2n, action);
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
});
