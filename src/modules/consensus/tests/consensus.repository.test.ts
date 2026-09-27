import { Prisma, type ConsensusState as PrismaConsensusState, type PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { GenericAbortedError, GenericAlreadyExistsError, GenericMapperError } from '@/errors/application.errors';

import type { AllocatedSequenceTransactionAction, RewoundSequenceTransactionAction } from '../consensus.application';
import { CONSENSUS_STATE_ID, type ConsensusState } from '../consensus.domain';
import { ConsensusStateRepository } from '../consensus.repository';

/* fixtures */

const now = new Date('2026-01-01T00:00:00.000Z');

const prismaState: PrismaConsensusState = {
  id: CONSENSUS_STATE_ID,
  current_epoch: 2n,
  leader_master_id: 'master-node-a',
  voted_for_master_id: 'master-node-a',
  last_leader_contact_at: now,

  last_allocated_sequence: 4n,
  last_committed_sequence: 3n,
  last_applied_sequence: 2n,
  created_at: now,
  updated_at: now,
  revision: 5n
};

const state: ConsensusState = {
  id: CONSENSUS_STATE_ID,
  currentEpoch: 2n,
  leaderMasterId: 'master-node-a',
  votedForMasterId: 'master-node-a',
  lastLeaderContactAt: now,

  lastAllocatedSequence: 4n,
  lastCommittedSequence: 3n,
  lastAppliedSequence: 2n,
  createdAt: now,
  updatedAt: now,
  revision: 5n
};

const createPrismaError = (code: string): Prisma.PrismaClientKnownRequestError => {
  return new Prisma.PrismaClientKnownRequestError('Prisma operation failed', {
    code,
    clientVersion: 'test'
  });
};

/* mocks */

type ConsensusStateDelegateMock = {
  findUnique: jest.Mock<(...args: unknown[]) => Promise<PrismaConsensusState | null>>;
  findUniqueOrThrow: jest.Mock<(...args: unknown[]) => Promise<PrismaConsensusState>>;
  create: jest.Mock<(...args: unknown[]) => Promise<PrismaConsensusState>>;
  updateMany: jest.Mock<(...args: unknown[]) => Promise<{ count: number }>>;
};

describe('ConsensusStateRepository', () => {
  let delegate: ConsensusStateDelegateMock;
  let transactionClient: { consensusState: ConsensusStateDelegateMock };
  let repository: ConsensusStateRepository;

  beforeEach(() => {
    delegate = {
      findUnique: jest
        .fn<(...args: unknown[]) => Promise<PrismaConsensusState | null>>()
        .mockResolvedValue(prismaState),
      findUniqueOrThrow: jest
        .fn<(...args: unknown[]) => Promise<PrismaConsensusState>>()
        .mockResolvedValue(prismaState),
      create: jest.fn<(...args: unknown[]) => Promise<PrismaConsensusState>>().mockResolvedValue(prismaState),
      updateMany: jest.fn<(...args: unknown[]) => Promise<{ count: number }>>().mockResolvedValue({ count: 1 })
    };
    transactionClient = { consensusState: delegate };

    const transaction = jest.fn(async (action: (tx: typeof transactionClient) => Promise<unknown>) =>
      action(transactionClient)
    );

    repository = new ConsensusStateRepository({
      consensusState: delegate,
      $transaction: transaction
    } as unknown as PrismaClient);
  });

  test('finds the singleton consensus state', async () => {
    await expect(repository.findState()).resolves.toEqual(state);
    expect(delegate.findUnique).toHaveBeenCalledWith({
      where: { id: CONSENSUS_STATE_ID }
    });
  });

  test('returns null when the singleton consensus state does not exist', async () => {
    delegate.findUnique.mockResolvedValue(null);

    await expect(repository.findState()).resolves.toBeNull();
  });

  test('creates the singleton consensus state with its fixed id', async () => {
    await expect(repository.createState()).resolves.toEqual(state);
    expect(delegate.create).toHaveBeenCalledWith({
      data: { id: CONSENSUS_STATE_ID }
    });
  });

  test('maps concurrent state creation to an already-exists error', async () => {
    delegate.create.mockRejectedValue(createPrismaError('P2002'));

    await expect(repository.createState()).rejects.toBeInstanceOf(GenericAlreadyExistsError);
  });

  test('advances the committed sequence monotonically and returns the stored state', async () => {
    const advancedPrismaState = {
      ...prismaState,
      last_committed_sequence: 4n,
      revision: 6n
    };

    delegate.findUniqueOrThrow.mockResolvedValue(advancedPrismaState);

    await expect(repository.advanceLastCommittedSequence({ id: CONSENSUS_STATE_ID, sequence: 4n })).resolves.toEqual({
      ...state,
      lastCommittedSequence: 4n,
      revision: 6n
    });
    expect(delegate.updateMany).toHaveBeenCalledWith({
      where: {
        id: CONSENSUS_STATE_ID,
        last_committed_sequence: { lt: 4n },
        last_allocated_sequence: { gte: 4n }
      },
      data: {
        last_committed_sequence: 4n,
        revision: { increment: 1 }
      }
    });
    expect(delegate.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: CONSENSUS_STATE_ID }
    });
  });

  test('returns the existing committed sequence when a stale advancement loses its gate', async () => {
    delegate.updateMany.mockResolvedValue({ count: 0 });

    await expect(repository.advanceLastCommittedSequence({ id: CONSENSUS_STATE_ID, sequence: 2n })).resolves.toEqual(
      state
    );
  });

  test('advances the applied sequence monotonically', async () => {
    const advancedPrismaState = {
      ...prismaState,
      last_applied_sequence: 3n,
      revision: 6n
    };

    delegate.findUniqueOrThrow.mockResolvedValue(advancedPrismaState);

    await expect(repository.advanceLastAppliedSequence({ id: CONSENSUS_STATE_ID, sequence: 3n })).resolves.toEqual({
      ...state,
      lastAppliedSequence: 3n,
      revision: 6n
    });
    expect(delegate.updateMany).toHaveBeenCalledWith({
      where: {
        id: CONSENSUS_STATE_ID,
        last_applied_sequence: { lt: 3n },
        last_committed_sequence: { gte: 3n }
      },
      data: {
        last_applied_sequence: 3n,
        revision: { increment: 1 }
      }
    });
  });

  test('allocates a sequence under the expected epoch and runs the action in the transaction', async () => {
    const allocatedPrismaState = {
      ...prismaState,
      last_allocated_sequence: 5n,
      revision: 6n
    };
    const action = jest
      .fn<AllocatedSequenceTransactionAction<string>>()
      .mockImplementation(async (_tx, sequence) => `allocated-${sequence}`);

    delegate.findUniqueOrThrow.mockResolvedValue(allocatedPrismaState);

    await expect(repository.withAdvancedLastAllocatedSequence(CONSENSUS_STATE_ID, 2n, action)).resolves.toBe(
      'allocated-5'
    );
    expect(delegate.updateMany).toHaveBeenCalledWith({
      where: { id: CONSENSUS_STATE_ID, current_epoch: 2n },
      data: {
        last_allocated_sequence: { increment: 1 },
        revision: { increment: 1 }
      }
    });
    expect(action).toHaveBeenCalledWith(transactionClient as unknown as Prisma.TransactionClient, 5n);
  });

  test('aborts sequence allocation when the epoch has changed', async () => {
    const action = jest.fn<AllocatedSequenceTransactionAction<string>>();

    delegate.updateMany.mockResolvedValue({ count: 0 });

    await expect(repository.withAdvancedLastAllocatedSequence(CONSENSUS_STATE_ID, 1n, action)).rejects.toBeInstanceOf(
      GenericAbortedError
    );
    expect(delegate.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(action).not.toHaveBeenCalled();
  });

  test('propagates failures from the sequence allocation action', async () => {
    const actionError = new Error('Task creation failed');
    const action = jest.fn<AllocatedSequenceTransactionAction<void>>().mockRejectedValue(actionError);

    await expect(repository.withAdvancedLastAllocatedSequence(CONSENSUS_STATE_ID, 2n, action)).rejects.toBe(
      actionError
    );
  });

  test('rewinds the allocated sequence under the expected epoch and runs the action in the transaction', async () => {
    const action = jest
      .fn<RewoundSequenceTransactionAction<string>>()
      .mockImplementation(async (_tx, sequence) => `rewound-${sequence}`);

    await expect(repository.withRewoundLastAllocatedSequence(CONSENSUS_STATE_ID, 2n, 3n, action)).resolves.toBe(
      'rewound-3'
    );
    expect(delegate.updateMany).toHaveBeenCalledWith({
      where: {
        id: CONSENSUS_STATE_ID,
        current_epoch: 2n,
        last_allocated_sequence: { gte: 3n },
        last_committed_sequence: { lte: 3n }
      },
      data: {
        last_allocated_sequence: 3n,
        revision: { increment: 1 }
      }
    });
    expect(action).toHaveBeenCalledWith(transactionClient as unknown as Prisma.TransactionClient, 3n);
  });

  test('aborts sequence rewind when its consensus gate is lost', async () => {
    const action = jest.fn<RewoundSequenceTransactionAction<void>>();

    delegate.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      repository.withRewoundLastAllocatedSequence(CONSENSUS_STATE_ID, 2n, 3n, action)
    ).rejects.toBeInstanceOf(GenericAbortedError);
    expect(action).not.toHaveBeenCalled();
  });

  test('runs sequence-tail work while keeping an already matching allocated sequence', async () => {
    const action = jest.fn<RewoundSequenceTransactionAction<string>>().mockResolvedValue('deleted-crash-window-row');

    await expect(repository.withRewoundLastAllocatedSequence(CONSENSUS_STATE_ID, 2n, 4n, action)).resolves.toBe(
      'deleted-crash-window-row'
    );
    expect(delegate.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          last_allocated_sequence: { gte: 4n }
        }),
        data: expect.objectContaining({
          last_allocated_sequence: 4n
        })
      })
    );
    expect(action).toHaveBeenCalledWith(transactionClient as unknown as Prisma.TransactionClient, 4n);
  });

  test('propagates failures from the sequence rewind action', async () => {
    const actionError = new Error('Task truncation failed');
    const action = jest.fn<RewoundSequenceTransactionAction<void>>().mockRejectedValue(actionError);

    await expect(repository.withRewoundLastAllocatedSequence(CONSENSUS_STATE_ID, 2n, 3n, action)).rejects.toBe(
      actionError
    );
  });

  test('claims leadership while no leader exists and the epoch is older', async () => {
    await expect(
      repository.claimLeadership({
        id: CONSENSUS_STATE_ID,
        epoch: 3n,
        leaderMasterId: 'master-node-b',
        lastLeaderContactAt: now
      })
    ).resolves.toBe(true);
    expect(delegate.updateMany).toHaveBeenCalledWith({
      where: {
        id: CONSENSUS_STATE_ID,
        leader_master_id: null,
        OR: [{ current_epoch: { lt: 3n } }, { current_epoch: 3n, voted_for_master_id: 'master-node-b' }]
      },
      data: {
        current_epoch: 3n,
        leader_master_id: 'master-node-b',
        voted_for_master_id: 'master-node-b',
        last_leader_contact_at: now,
        revision: { increment: 1 }
      }
    });
  });

  test('does not steal an existing leader even with a newer epoch', async () => {
    delegate.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      repository.claimLeadership({
        id: CONSENSUS_STATE_ID,
        epoch: 10n,
        leaderMasterId: 'master-node-b',
        lastLeaderContactAt: now
      })
    ).resolves.toBe(false);
    expect(delegate.updateMany).toHaveBeenCalledWith({
      where: {
        id: CONSENSUS_STATE_ID,
        leader_master_id: null,
        OR: [{ current_epoch: { lt: 10n } }, { current_epoch: 10n, voted_for_master_id: 'master-node-b' }]
      },
      data: {
        current_epoch: 10n,
        leader_master_id: 'master-node-b',
        voted_for_master_id: 'master-node-b',
        last_leader_contact_at: now,
        revision: { increment: 1 }
      }
    });
  });

  test('accepts followership only while no leader exists', async () => {
    await expect(
      repository.acceptFollowership({
        id: CONSENSUS_STATE_ID,
        epoch: 3n,
        leaderMasterId: 'master-node-b',
        lastLeaderContactAt: now
      })
    ).resolves.toBe(true);
    expect(delegate.updateMany).toHaveBeenCalledWith({
      where: {
        id: CONSENSUS_STATE_ID,
        OR: [
          { current_epoch: { lt: 3n } },
          {
            current_epoch: 3n,
            OR: [{ leader_master_id: null }, { leader_master_id: 'master-node-b' }]
          }
        ]
      },
      data: {
        current_epoch: 3n,
        leader_master_id: 'master-node-b',
        voted_for_master_id: 'master-node-b',
        last_leader_contact_at: now,
        revision: { increment: 1 }
      }
    });
  });

  test('reports a lost followership acceptance gate', async () => {
    delegate.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      repository.acceptFollowership({
        id: CONSENSUS_STATE_ID,
        epoch: 3n,
        leaderMasterId: 'master-node-b',
        lastLeaderContactAt: now
      })
    ).resolves.toBe(false);
  });

  test('relinquishes leadership only for the expected leader and epoch', async () => {
    await expect(
      repository.relinquishLeadership({
        id: CONSENSUS_STATE_ID,
        epoch: 2n,
        leaderMasterId: 'master-node-a'
      })
    ).resolves.toBe(true);
    expect(delegate.updateMany).toHaveBeenCalledWith({
      where: {
        id: CONSENSUS_STATE_ID,
        current_epoch: 2n,
        leader_master_id: 'master-node-a'
      },
      data: {
        leader_master_id: null,
        last_leader_contact_at: null,
        revision: { increment: 1 }
      }
    });
  });

  test('starts an election by advancing the epoch and voting for the candidate', async () => {
    const electionPrismaState = {
      ...prismaState,
      current_epoch: 3n,
      leader_master_id: null,
      voted_for_master_id: 'master-node-b',
      last_leader_contact_at: null,
      revision: 6n
    };

    delegate.findUniqueOrThrow.mockResolvedValue(electionPrismaState);

    await expect(
      repository.startElection({
        id: CONSENSUS_STATE_ID,
        expectedEpoch: 2n,
        electionEpoch: 3n,
        candidateMasterNodeId: 'master-node-b'
      })
    ).resolves.toEqual({
      ...state,
      currentEpoch: 3n,
      leaderMasterId: null,
      votedForMasterId: 'master-node-b',
      lastLeaderContactAt: null,
      revision: 6n
    });
    expect(delegate.updateMany).toHaveBeenCalledWith({
      where: {
        id: CONSENSUS_STATE_ID,
        current_epoch: 2n
      },
      data: {
        current_epoch: 3n,
        leader_master_id: null,
        voted_for_master_id: 'master-node-b',
        last_leader_contact_at: null,
        revision: { increment: 1 }
      }
    });
  });

  test('observes a newer epoch and clears local leader and vote state', async () => {
    const observedPrismaState = {
      ...prismaState,
      current_epoch: 4n,
      leader_master_id: null,
      voted_for_master_id: null,
      last_leader_contact_at: null,
      revision: 6n
    };

    delegate.findUniqueOrThrow.mockResolvedValue(observedPrismaState);

    await expect(repository.observeEpoch({ id: CONSENSUS_STATE_ID, epoch: 4n })).resolves.toEqual({
      ...state,
      currentEpoch: 4n,
      leaderMasterId: null,
      votedForMasterId: null,
      lastLeaderContactAt: null,
      revision: 6n
    });
  });

  test('advances to a candidate epoch and persists one vote atomically', async () => {
    const observedPrismaState = {
      ...prismaState,
      current_epoch: 3n,
      leader_master_id: null,
      voted_for_master_id: null,
      last_leader_contact_at: null,
      revision: 6n
    };
    const votedPrismaState = {
      ...observedPrismaState,
      voted_for_master_id: 'master-node-b',
      revision: 7n
    };

    delegate.findUniqueOrThrow
      .mockResolvedValueOnce(prismaState)
      .mockResolvedValueOnce(observedPrismaState)
      .mockResolvedValueOnce(votedPrismaState);

    await expect(
      repository.applyVoteRequest({
        id: CONSENSUS_STATE_ID,
        epoch: 3n,
        candidateMasterNodeId: 'master-node-b',
        candidateLogIsUpToDate: true
      })
    ).resolves.toEqual({
      state: {
        ...state,
        currentEpoch: 3n,
        leaderMasterId: null,
        votedForMasterId: 'master-node-b',
        lastLeaderContactAt: null,
        revision: 7n
      },
      voteGranted: true
    });
    expect(delegate.updateMany).toHaveBeenCalledTimes(2);
  });

  test('does not grant a second vote in the same epoch', async () => {
    delegate.findUniqueOrThrow.mockResolvedValue({
      ...prismaState,
      current_epoch: 3n,
      leader_master_id: null,
      voted_for_master_id: 'master-node-c',
      last_leader_contact_at: null
    });

    await expect(
      repository.applyVoteRequest({
        id: CONSENSUS_STATE_ID,
        epoch: 3n,
        candidateMasterNodeId: 'master-node-b',
        candidateLogIsUpToDate: true
      })
    ).resolves.toEqual({
      state: {
        ...state,
        currentEpoch: 3n,
        leaderMasterId: null,
        votedForMasterId: 'master-node-c',
        lastLeaderContactAt: null
      },
      voteGranted: false
    });
    expect(delegate.updateMany).not.toHaveBeenCalled();
  });

  test('propagates mapper errors from invalid persisted state', async () => {
    delegate.findUnique.mockResolvedValue({
      ...prismaState,
      current_epoch: -1n
    });

    await expect(repository.findState()).rejects.toBeInstanceOf(GenericMapperError);
  });
});
