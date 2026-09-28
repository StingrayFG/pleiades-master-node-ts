import type { PrismaClient } from '@prisma/client';

import { mapPrismaError, type PrismaErrorMapperOverrides } from '@/database/prisma/error-mapper';

import type {
  CreateByteStorageObjectRepositoryInput,
  ListDeletingCleanupCandidatesRepositoryInput,
  ListPendingCleanupCandidatesRepositoryInput,
  TouchByteStorageObjectDeletionCandidateRepositoryInput,
  TransitionByteStorageObjectStateRepositoryInput
} from './byte-storage.application';
import type { ByteStorageId, ByteStorageObject, ByteStorageObjectState } from './byte-storage.domain';
import { mapPrismaByteStorageObjectToDomainByteStorageObject } from './byte-storage.mappers';

/* contract */

type ByteStorageRepositoryContract = {
  listPendingCleanupCandidates(input: ListPendingCleanupCandidatesRepositoryInput): Promise<ByteStorageObject[]>;
  listDeletingCleanupCandidates(input: ListDeletingCleanupCandidatesRepositoryInput): Promise<ByteStorageObject[]>;
  findById(id: ByteStorageId): Promise<ByteStorageObject | null>;
  create(input: CreateByteStorageObjectRepositoryInput): Promise<ByteStorageObject>;
  transitionState(input: TransitionByteStorageObjectStateRepositoryInput): Promise<boolean>;
  touchDeletionCandidate(input: TouchByteStorageObjectDeletionCandidateRepositoryInput): Promise<boolean>;
  deleteByIdIfState(id: ByteStorageId, state: ByteStorageObjectState): Promise<boolean>;
};

/* repository */

const errorMap: PrismaErrorMapperOverrides = {};

class ByteStorageRepository implements ByteStorageRepositoryContract {
  constructor(private readonly prisma: PrismaClient) {}

  async listPendingCleanupCandidates(input: ListPendingCleanupCandidatesRepositoryInput): Promise<ByteStorageObject[]> {
    let objects;

    try {
      objects = await this.prisma.byteStorageObject.findMany({
        where: {
          state: 'pending',
          updated_at: {
            lte: input.updatedBefore
          }
        },
        orderBy: {
          updated_at: 'asc'
        },
        take: input.limit
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return objects.map(mapPrismaByteStorageObjectToDomainByteStorageObject);
  }

  async listDeletingCleanupCandidates(
    input: ListDeletingCleanupCandidatesRepositoryInput
  ): Promise<ByteStorageObject[]> {
    let objects;

    try {
      objects = await this.prisma.byteStorageObject.findMany({
        where: {
          state: 'deleting',
          updated_at: {
            lte: input.updatedBefore
          }
        },
        orderBy: {
          updated_at: 'asc'
        },
        take: input.limit
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return objects.map(mapPrismaByteStorageObjectToDomainByteStorageObject);
  }

  async findById(id: ByteStorageId): Promise<ByteStorageObject | null> {
    let object;

    try {
      object = await this.prisma.byteStorageObject.findUnique({
        where: {
          id
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return object ? mapPrismaByteStorageObjectToDomainByteStorageObject(object) : null;
  }

  async create(input: CreateByteStorageObjectRepositoryInput): Promise<ByteStorageObject> {
    let object;

    try {
      object = await this.prisma.byteStorageObject.create({
        data: {
          id: input.id,

          size_bytes: input.sizeBytes,
          checksum: input.checksum,
          checksum_algorithm: input.checksumAlgorithm,

          state: input.state
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return mapPrismaByteStorageObjectToDomainByteStorageObject(object);
  }

  async transitionState(input: TransitionByteStorageObjectStateRepositoryInput): Promise<boolean> {
    let transitionResult;

    try {
      transitionResult = await this.prisma.byteStorageObject.updateMany({
        where: {
          id: input.id,
          state: input.from
        },
        data: {
          state: input.to
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return transitionResult.count === 1;
  }

  async touchDeletionCandidate(input: TouchByteStorageObjectDeletionCandidateRepositoryInput): Promise<boolean> {
    let touchResult;

    try {
      touchResult = await this.prisma.byteStorageObject.updateMany({
        where: {
          id: input.id,
          state: 'deleting'
        },
        data: {
          state: 'deleting'
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return touchResult.count === 1;
  }

  async deleteByIdIfState(id: ByteStorageId, state: ByteStorageObjectState): Promise<boolean> {
    let deletionResult;

    try {
      deletionResult = await this.prisma.byteStorageObject.deleteMany({
        where: {
          id,
          state
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return deletionResult.count === 1;
  }
}

/* exports */

export { ByteStorageRepository };
export type { ByteStorageRepositoryContract };
