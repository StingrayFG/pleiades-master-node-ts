import type {
  ObjectVersionPart as PrismaObjectVersionPart,
  ObjectVersionPartReplica as PrismaObjectVersionPartReplica,
  PrismaClient
} from '@prisma/client';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { GenericFailedPreconditionError, GenericMapperError } from '@/errors/application.errors';
import { BLOB_CHECKSUM_ALGORITHM } from '@/modules/blobs/blob.domain';

import type { Part, PartReplica } from '../object-version-part.domain';
import { ObjectVersionPartRepository } from '../object-version-part.repository';

/* fixtures */

const now = new Date('2026-01-01T00:00:00.000Z');
const objectId = '00000000-0000-4000-8000-000000000001';
const blobId = '00000000-0000-4000-8000-000000000002';
const firstDataNodeId = 'data-node-a';
const secondDataNodeId = 'data-node-b';

const prismaPart: PrismaObjectVersionPart = {
  object_id: objectId,
  version: 1,
  part_number: 1,
  blob_id: blobId,
  placement_group: 4,
  size_bytes: 12n,
  checksum_algorithm: BLOB_CHECKSUM_ALGORITHM,
  checksum_value: 'a'.repeat(64),
  created_at: now
};

const part: Part = {
  objectId: prismaPart.object_id,
  version: prismaPart.version,
  partNumber: prismaPart.part_number,
  blobId: prismaPart.blob_id,
  placementGroup: prismaPart.placement_group,
  sizeBytes: prismaPart.size_bytes,
  checksumAlgorithm: BLOB_CHECKSUM_ALGORITHM,
  checksumValue: prismaPart.checksum_value,
  createdAt: prismaPart.created_at
};

const prismaReplica: PrismaObjectVersionPartReplica = {
  blob_id: blobId,
  data_node_id: firstDataNodeId,
  state: 'committed',
  created_at: now,
  last_verified_at: now,
  state_changed_at: now,
  updated_at: now
};

const replica: PartReplica = {
  blobId: prismaReplica.blob_id,
  dataNodeId: prismaReplica.data_node_id,
  state: prismaReplica.state,
  createdAt: prismaReplica.created_at,
  lastVerifiedAt: prismaReplica.last_verified_at,
  stateChangedAt: prismaReplica.state_changed_at,
  updatedAt: prismaReplica.updated_at
};

/* mocks */

type PartDelegateMock = {
  findMany: jest.Mock<(...args: unknown[]) => Promise<PrismaObjectVersionPart[]>>;
  findUnique: jest.Mock<(...args: unknown[]) => Promise<PrismaObjectVersionPart | null>>;
  create: jest.Mock<(...args: unknown[]) => Promise<PrismaObjectVersionPart>>;
  deleteMany: jest.Mock<(...args: unknown[]) => Promise<{ count: number }>>;
};

type ReplicaDelegateMock = {
  findMany: jest.Mock<(...args: unknown[]) => Promise<PrismaObjectVersionPartReplica[]>>;
  create: jest.Mock<(...args: unknown[]) => Promise<PrismaObjectVersionPartReplica>>;
  createMany: jest.Mock<(...args: unknown[]) => Promise<{ count: number }>>;
  updateMany: jest.Mock<(...args: unknown[]) => Promise<{ count: number }>>;
  deleteMany: jest.Mock<(...args: unknown[]) => Promise<{ count: number }>>;
};

describe('ObjectVersionPartRepository', () => {
  let partDelegate: PartDelegateMock;
  let replicaDelegate: ReplicaDelegateMock;
  let objectVersionUpdateMany: jest.Mock<(...args: unknown[]) => Promise<{ count: number }>>;
  let repository: ObjectVersionPartRepository;

  beforeEach(() => {
    partDelegate = {
      findMany: jest.fn<(...args: unknown[]) => Promise<PrismaObjectVersionPart[]>>().mockResolvedValue([]),
      findUnique: jest
        .fn<(...args: unknown[]) => Promise<PrismaObjectVersionPart | null>>()
        .mockResolvedValue(prismaPart),
      create: jest.fn<(...args: unknown[]) => Promise<PrismaObjectVersionPart>>().mockResolvedValue(prismaPart),
      deleteMany: jest.fn<(...args: unknown[]) => Promise<{ count: number }>>().mockResolvedValue({ count: 1 })
    };
    replicaDelegate = {
      findMany: jest.fn<(...args: unknown[]) => Promise<PrismaObjectVersionPartReplica[]>>().mockResolvedValue([]),
      create: jest
        .fn<(...args: unknown[]) => Promise<PrismaObjectVersionPartReplica>>()
        .mockResolvedValue(prismaReplica),
      createMany: jest.fn<(...args: unknown[]) => Promise<{ count: number }>>().mockResolvedValue({ count: 2 }),
      updateMany: jest.fn<(...args: unknown[]) => Promise<{ count: number }>>().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn<(...args: unknown[]) => Promise<{ count: number }>>().mockResolvedValue({ count: 1 })
    };
    objectVersionUpdateMany = jest
      .fn<(...args: unknown[]) => Promise<{ count: number }>>()
      .mockResolvedValue({ count: 1 });

    const transactionClient = {
      objectVersion: { updateMany: objectVersionUpdateMany },
      objectVersionPart: partDelegate,
      objectVersionPartReplica: replicaDelegate
    };
    const transaction = jest.fn(async (action: (tx: typeof transactionClient) => Promise<unknown>) =>
      action(transactionClient)
    );

    repository = new ObjectVersionPartRepository({
      objectVersionPart: partDelegate,
      objectVersionPartReplica: replicaDelegate,
      $transaction: transaction
    } as unknown as PrismaClient);
  });

  test('lists parts in part-number order and maps the result', async () => {
    partDelegate.findMany.mockResolvedValue([prismaPart]);

    await expect(repository.listPartsByObjectVersion(objectId, 1)).resolves.toEqual([part]);
    expect(partDelegate.findMany).toHaveBeenCalledWith({
      where: { object_id: objectId, version: 1 },
      orderBy: { part_number: 'asc' }
    });
  });

  test('uses the committed and age gates when listing verification candidates', async () => {
    const verifiedBefore = new Date('2026-01-02T00:00:00.000Z');

    replicaDelegate.findMany.mockResolvedValue([prismaReplica]);

    await expect(repository.listPartReplicaVerificationCandidates({ verifiedBefore, limit: 3 })).resolves.toEqual([
      replica
    ]);
    expect(replicaDelegate.findMany).toHaveBeenCalledWith({
      where: {
        state: 'committed',
        updated_at: { lte: verifiedBefore },
        OR: [{ last_verified_at: { lte: verifiedBefore } }, { last_verified_at: null }]
      },
      orderBy: { updated_at: 'asc' },
      take: 3
    });
  });

  test('creates a part and pending replicas only while its object version is pending', async () => {
    await expect(
      repository.createPartWithReplicas({
        part: {
          objectId: part.objectId,
          version: part.version,
          partNumber: part.partNumber,
          blobId: part.blobId,
          placementGroup: part.placementGroup,
          sizeBytes: part.sizeBytes,
          checksumAlgorithm: part.checksumAlgorithm,
          checksumValue: part.checksumValue
        },
        replicaDataNodeIds: [firstDataNodeId, secondDataNodeId]
      })
    ).resolves.toEqual(part);

    expect(objectVersionUpdateMany).toHaveBeenCalledWith({
      where: { object_id: objectId, version: 1, state: 'pending' },
      data: { state: 'pending' }
    });
    expect(partDelegate.create).toHaveBeenCalledWith({
      data: {
        object_id: objectId,
        version: 1,
        part_number: 1,
        blob_id: blobId,
        placement_group: 4,
        size_bytes: 12n,
        checksum_algorithm: BLOB_CHECKSUM_ALGORITHM,
        checksum_value: 'a'.repeat(64)
      }
    });
    expect(replicaDelegate.createMany).toHaveBeenCalledWith({
      data: [
        { blob_id: blobId, data_node_id: firstDataNodeId, state: 'pending' },
        { blob_id: blobId, data_node_id: secondDataNodeId, state: 'pending' }
      ]
    });
  });

  test('rejects part creation after the object version leaves pending', async () => {
    objectVersionUpdateMany.mockResolvedValue({ count: 0 });

    await expect(
      repository.createPartWithReplicas({
        part: {
          objectId: part.objectId,
          version: part.version,
          partNumber: part.partNumber,
          blobId: part.blobId,
          placementGroup: part.placementGroup,
          sizeBytes: part.sizeBytes,
          checksumAlgorithm: part.checksumAlgorithm,
          checksumValue: part.checksumValue
        },
        replicaDataNodeIds: [firstDataNodeId]
      })
    ).rejects.toBeInstanceOf(GenericFailedPreconditionError);
    expect(partDelegate.create).not.toHaveBeenCalled();
  });

  test('claims a failed replica and creates its pending replacement atomically', async () => {
    await expect(
      repository.claimPartReplicaRepair({
        blobId,
        failedDataNodeId: firstDataNodeId,
        replacementDataNodeId: secondDataNodeId,
        expectedState: 'missing'
      })
    ).resolves.toBe(true);

    expect(replicaDelegate.updateMany).toHaveBeenCalledWith({
      where: {
        blob_id: blobId,
        data_node_id: firstDataNodeId,
        state: 'missing',
        object_version_part: { object_version: { state: 'committed' } }
      },
      data: { state: 'deleting', state_changed_at: expect.any(Date) }
    });
    expect(replicaDelegate.create).toHaveBeenCalledWith({
      data: { blob_id: blobId, data_node_id: secondDataNodeId, state: 'pending' }
    });
  });

  test('does not create a replacement when a repair claim loses its state gate', async () => {
    replicaDelegate.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      repository.claimPartReplicaRepair({
        blobId,
        failedDataNodeId: firstDataNodeId,
        replacementDataNodeId: secondDataNodeId,
        expectedState: 'corrupt'
      })
    ).resolves.toBe(false);
    expect(replicaDelegate.create).not.toHaveBeenCalled();
  });

  test('refreshes verification without changing the state timestamp when the state remains committed', async () => {
    const verifiedAt = new Date('2026-01-02T00:00:00.000Z');

    await expect(
      repository.applyPartReplicaVerification({ blobId, dataNodeId: firstDataNodeId, state: 'committed', verifiedAt })
    ).resolves.toBe(true);
    expect(replicaDelegate.updateMany).toHaveBeenCalledWith({
      where: { blob_id: blobId, data_node_id: firstDataNodeId, state: 'committed' },
      data: { state: 'committed', last_verified_at: verifiedAt }
    });
  });

  test('updates the state timestamp when verification changes replica state', async () => {
    await repository.applyPartReplicaVerification({
      blobId,
      dataNodeId: firstDataNodeId,
      state: 'corrupt'
    });

    expect(replicaDelegate.updateMany).toHaveBeenCalledWith({
      where: { blob_id: blobId, data_node_id: firstDataNodeId, state: 'committed' },
      data: { state: 'corrupt', state_changed_at: expect.any(Date) }
    });
  });

  test('only changes repair timestamps for real transitions from pending', async () => {
    await repository.applyPartReplicaRepair({ blobId, dataNodeId: firstDataNodeId, state: 'pending' });
    await repository.applyPartReplicaRepair({ blobId, dataNodeId: firstDataNodeId, state: 'committed' });

    expect(replicaDelegate.updateMany).toHaveBeenNthCalledWith(1, {
      where: { blob_id: blobId, data_node_id: firstDataNodeId, state: 'pending' },
      data: { state: 'pending' }
    });
    expect(replicaDelegate.updateMany).toHaveBeenNthCalledWith(2, {
      where: { blob_id: blobId, data_node_id: firstDataNodeId, state: 'pending' },
      data: { state: 'committed', state_changed_at: expect.any(Date) }
    });
  });

  test('applies a batch of replica transitions with optimistic state gates', async () => {
    await repository.updatePartReplicaStates([
      {
        blobId,
        dataNodeId: firstDataNodeId,
        expectedState: 'pending',
        state: 'committed'
      },
      {
        blobId,
        dataNodeId: secondDataNodeId,
        expectedState: 'missing',
        state: 'missing'
      }
    ]);

    expect(replicaDelegate.updateMany).toHaveBeenNthCalledWith(1, {
      where: { blob_id: blobId, data_node_id: firstDataNodeId, state: 'pending' },
      data: { state: 'committed', state_changed_at: expect.any(Date) }
    });
    expect(replicaDelegate.updateMany).toHaveBeenNthCalledWith(2, {
      where: { blob_id: blobId, data_node_id: secondDataNodeId, state: 'missing' },
      data: { state: 'missing' }
    });
  });

  test('rejects a replica state batch when any optimistic gate is stale', async () => {
    replicaDelegate.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      repository.updatePartReplicaStates([
        {
          blobId,
          dataNodeId: firstDataNodeId,
          expectedState: 'pending',
          state: 'committed'
        }
      ])
    ).rejects.toBeInstanceOf(GenericFailedPreconditionError);
  });

  test('gates touch and deletion operations on their expected states', async () => {
    await expect(
      repository.touchPartReplicaVerificationCandidate({ blobId, dataNodeId: firstDataNodeId })
    ).resolves.toBe(true);
    await expect(
      repository.touchPartReplicaRepairCandidate({ blobId, dataNodeId: firstDataNodeId, state: 'missing' })
    ).resolves.toBe(true);
    await expect(repository.deletePartReplicaIfDeleting({ blobId, dataNodeId: firstDataNodeId })).resolves.toBe(true);

    expect(replicaDelegate.updateMany).toHaveBeenNthCalledWith(1, {
      where: { blob_id: blobId, data_node_id: firstDataNodeId, state: 'committed' },
      data: { state: 'committed' }
    });
    expect(replicaDelegate.updateMany).toHaveBeenNthCalledWith(2, {
      where: { blob_id: blobId, data_node_id: firstDataNodeId, state: 'missing' },
      data: { state: 'missing' }
    });
    expect(replicaDelegate.deleteMany).toHaveBeenCalledWith({
      where: { blob_id: blobId, data_node_id: firstDataNodeId, state: 'deleting' }
    });
  });

  test('propagates mapper errors from invalid Prisma rows', async () => {
    partDelegate.findMany.mockResolvedValue([{ ...prismaPart, part_number: 0 }]);

    await expect(repository.listPartsByObjectVersion(objectId, 1)).rejects.toBeInstanceOf(GenericMapperError);
  });
});
