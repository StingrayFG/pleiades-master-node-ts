import type { PrismaClient } from '@prisma/client';

import { mapPrismaError, type PrismaErrorMapperOverrides } from '@/database/prisma/error-mapper';
import { isUniqueConstraintError } from '@/database/prisma/error-predicates';
import { GenericFailedPreconditionError } from '@/errors/application.errors';

import type { BlobId } from '@/modules/blobs/blob.domain';
import type { ObjectId, ObjectVersionNumber } from '@/modules/objects/object.domain';

import type {
  ApplyObjectVersionDeletionToPartReplicasRepositoryInput,
  ApplyPartReplicaRepairRepositoryInput,
  ApplyPartReplicaVerificationRepositoryInput,
  ApplyPendingPartReplicaReconciliationRepositoryInput,
  ApplyRedundantPartReplicaDeletionRepositoryInput,
  ClaimPartReplicaRepairRepositoryInput,
  CreatePartWithReplicasRepositoryInput,
  DeletePartReplicaIfDeletingRepositoryInput,
  DeleteReplicaFreePartsByObjectVersionRepositoryInput,
  ListPartReplicaDeletionCandidatesRepositoryInput,
  ListPartReplicaRepairCandidatesRepositoryInput,
  ListPartReplicaVerificationCandidatesRepositoryInput,
  ListPendingPartReplicaReconciliationCandidatesRepositoryInput,
  TouchPartReplicaDeletionCandidateRepositoryInput,
  TouchPartReplicaRepairCandidateRepositoryInput,
  TouchPartReplicaVerificationCandidateRepositoryInput,
  UpdatePartReplicaStatesRepositoryInput
} from './object-version-part.application';
import type { Part, PartReplica } from './object-version-part.domain';
import { mapPrismaPartReplicaToDomainPartReplica, mapPrismaPartToDomainPart } from './object-version-part.mappers';

/* contract */

type ObjectVersionPartRepositoryContract = {
  // list
  listPartsByObjectVersion(objectId: ObjectId, version: ObjectVersionNumber): Promise<Part[]>;
  listPartReplicasByBlobId(blobId: BlobId): Promise<PartReplica[]>;
  listPartReplicaVerificationCandidates(
    input: ListPartReplicaVerificationCandidatesRepositoryInput
  ): Promise<PartReplica[]>;
  listPendingPartReplicaReconciliationCandidates(
    input: ListPendingPartReplicaReconciliationCandidatesRepositoryInput
  ): Promise<PartReplica[]>;
  listPartReplicaRepairCandidates(input: ListPartReplicaRepairCandidatesRepositoryInput): Promise<PartReplica[]>;
  listPartReplicaDeletionCandidates(input: ListPartReplicaDeletionCandidatesRepositoryInput): Promise<PartReplica[]>;
  listCommittedPartReplicasByBlobId(blobId: BlobId): Promise<PartReplica[]>;

  // find
  findPartByBlobId(blobId: BlobId): Promise<Part | null>;

  // create
  createPartWithReplicas(input: CreatePartWithReplicasRepositoryInput): Promise<Part>;

  // claim
  claimPartReplicaRepair(input: ClaimPartReplicaRepairRepositoryInput): Promise<boolean>;

  // apply
  applyObjectVersionDeletionToPartReplicas(
    input: ApplyObjectVersionDeletionToPartReplicasRepositoryInput
  ): Promise<void>;
  applyPartReplicaVerification(input: ApplyPartReplicaVerificationRepositoryInput): Promise<boolean>;
  applyPartReplicaRepair(input: ApplyPartReplicaRepairRepositoryInput): Promise<boolean>;
  applyPendingPartReplicaReconciliation(input: ApplyPendingPartReplicaReconciliationRepositoryInput): Promise<boolean>;
  applyRedundantPartReplicaDeletion(input: ApplyRedundantPartReplicaDeletionRepositoryInput): Promise<boolean>;

  // update
  updatePartReplicaStates(input: UpdatePartReplicaStatesRepositoryInput): Promise<void>;

  // touch
  touchPartReplicaVerificationCandidate(input: TouchPartReplicaVerificationCandidateRepositoryInput): Promise<boolean>;
  touchPartReplicaRepairCandidate(input: TouchPartReplicaRepairCandidateRepositoryInput): Promise<boolean>;
  touchPartReplicaDeletionCandidate(input: TouchPartReplicaDeletionCandidateRepositoryInput): Promise<boolean>;

  // delete
  deletePartReplicaIfDeleting(input: DeletePartReplicaIfDeletingRepositoryInput): Promise<boolean>;
  deleteReplicaFreePartsByObjectVersion(input: DeleteReplicaFreePartsByObjectVersionRepositoryInput): Promise<number>;
};

/* repository */

const errorMap: PrismaErrorMapperOverrides = {};

class ObjectVersionPartRepository implements ObjectVersionPartRepositoryContract {
  constructor(private readonly prisma: PrismaClient) {}

  /* list methods */

  async listPartsByObjectVersion(objectId: ObjectId, version: ObjectVersionNumber): Promise<Part[]> {
    let parts;

    try {
      parts = await this.prisma.objectVersionPart.findMany({
        where: {
          object_id: objectId,
          version
        },
        orderBy: {
          part_number: 'asc'
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return parts.map(mapPrismaPartToDomainPart);
  }

  async listPartReplicasByBlobId(blobId: BlobId): Promise<PartReplica[]> {
    let partReplicas;

    try {
      partReplicas = await this.prisma.objectVersionPartReplica.findMany({
        where: {
          blob_id: blobId
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return partReplicas.map(mapPrismaPartReplicaToDomainPartReplica);
  }

  async listPartReplicaVerificationCandidates(
    input: ListPartReplicaVerificationCandidatesRepositoryInput
  ): Promise<PartReplica[]> {
    let partReplicas;

    try {
      partReplicas = await this.prisma.objectVersionPartReplica.findMany({
        where: {
          state: 'committed',
          updated_at: {
            lte: input.verifiedBefore
          },
          OR: [
            {
              last_verified_at: {
                lte: input.verifiedBefore
              }
            },
            {
              last_verified_at: null
            }
          ]
        },
        orderBy: {
          updated_at: 'asc'
        },
        take: input.limit
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return partReplicas.map(mapPrismaPartReplicaToDomainPartReplica);
  }

  async listPendingPartReplicaReconciliationCandidates(
    input: ListPendingPartReplicaReconciliationCandidatesRepositoryInput
  ): Promise<PartReplica[]> {
    let partReplicas;

    try {
      partReplicas = await this.prisma.objectVersionPartReplica.findMany({
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

    return partReplicas.map(mapPrismaPartReplicaToDomainPartReplica);
  }

  async listPartReplicaRepairCandidates(input: ListPartReplicaRepairCandidatesRepositoryInput): Promise<PartReplica[]> {
    let partReplicas;

    try {
      partReplicas = await this.prisma.objectVersionPartReplica.findMany({
        where: {
          state: {
            in: ['missing', 'corrupt']
          },
          updated_at: {
            lte: input.updatedBefore
          },
          object_version_part: {
            object_version: {
              state: 'committed'
            }
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

    return partReplicas.map(mapPrismaPartReplicaToDomainPartReplica);
  }

  async listPartReplicaDeletionCandidates(
    input: ListPartReplicaDeletionCandidatesRepositoryInput
  ): Promise<PartReplica[]> {
    let partReplicas;

    try {
      partReplicas = await this.prisma.objectVersionPartReplica.findMany({
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

    return partReplicas.map(mapPrismaPartReplicaToDomainPartReplica);
  }

  async listCommittedPartReplicasByBlobId(blobId: BlobId): Promise<PartReplica[]> {
    let partReplicas;

    try {
      partReplicas = await this.prisma.objectVersionPartReplica.findMany({
        where: {
          blob_id: blobId,
          state: 'committed'
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return partReplicas.map(mapPrismaPartReplicaToDomainPartReplica);
  }

  /* find methods */

  async findPartByBlobId(blobId: BlobId): Promise<Part | null> {
    let part;

    try {
      part = await this.prisma.objectVersionPart.findUnique({
        where: {
          blob_id: blobId
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return part ? mapPrismaPartToDomainPart(part) : null;
  }

  /* create methods */

  async createPartWithReplicas(input: CreatePartWithReplicasRepositoryInput): Promise<Part> {
    let part;

    try {
      part = await this.prisma.$transaction(async (tx) => {
        const objectVersionUpdateResult = await tx.objectVersion.updateMany({
          where: {
            object_id: input.part.objectId,
            version: input.part.version,
            state: 'pending'
          },
          data: {
            state: 'pending'
          }
        });

        if (objectVersionUpdateResult.count !== 1) {
          throw new GenericFailedPreconditionError('Object version is not pending');
        }

        const createdPart = await tx.objectVersionPart.create({
          data: {
            object_id: input.part.objectId,
            version: input.part.version,
            part_number: input.part.partNumber,

            blob_id: input.part.blobId,
            placement_group: input.part.placementGroup,
            size_bytes: input.part.sizeBytes,
            checksum_algorithm: input.part.checksumAlgorithm,
            checksum_value: input.part.checksumValue
          }
        });

        await tx.objectVersionPartReplica.createMany({
          data: input.replicaDataNodeIds.map((dataNodeId) => ({
            blob_id: input.part.blobId,
            data_node_id: dataNodeId,
            state: 'pending'
          }))
        });

        return createdPart;
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return mapPrismaPartToDomainPart(part);
  }

  /* claim methods */

  async claimPartReplicaRepair(input: ClaimPartReplicaRepairRepositoryInput): Promise<boolean> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const failedReplicaUpdateResult = await tx.objectVersionPartReplica.updateMany({
          where: {
            blob_id: input.blobId,
            data_node_id: input.failedDataNodeId,
            state: input.expectedState,
            object_version_part: {
              object_version: {
                state: 'committed'
              }
            }
          },
          data: {
            state: 'deleting',
            state_changed_at: new Date()
          }
        });

        if (failedReplicaUpdateResult.count !== 1) {
          return false;
        }

        await tx.objectVersionPartReplica.create({
          data: {
            blob_id: input.blobId,
            data_node_id: input.replacementDataNodeId,
            state: 'pending'
          }
        });

        return true;
      });
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        return false;
      }

      throw mapPrismaError(err, errorMap) ?? err;
    }
  }

  /* apply methods */

  async applyObjectVersionDeletionToPartReplicas(
    input: ApplyObjectVersionDeletionToPartReplicasRepositoryInput
  ): Promise<void> {
    try {
      await this.prisma.objectVersionPartReplica.updateMany({
        where: {
          state: {
            not: 'deleting'
          },
          object_version_part: {
            object_id: input.objectId,
            version: input.version,
            object_version: {
              state: 'deleting'
            }
          }
        },
        data: {
          state: 'deleting',
          state_changed_at: new Date()
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }
  }

  async applyPartReplicaVerification(input: ApplyPartReplicaVerificationRepositoryInput): Promise<boolean> {
    let verificationUpdateResult;

    try {
      verificationUpdateResult = await this.prisma.objectVersionPartReplica.updateMany({
        where: {
          blob_id: input.blobId,
          data_node_id: input.dataNodeId,
          state: 'committed'
        },
        data: {
          state: input.state,

          ...(input.state !== 'committed'
            ? {
                state_changed_at: new Date()
              }
            : {}),

          ...(input.verifiedAt !== undefined
            ? {
                last_verified_at: input.verifiedAt
              }
            : {})
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return verificationUpdateResult.count === 1;
  }

  async applyPartReplicaRepair(input: ApplyPartReplicaRepairRepositoryInput): Promise<boolean> {
    let repairUpdateResult;

    try {
      repairUpdateResult = await this.prisma.objectVersionPartReplica.updateMany({
        where: {
          blob_id: input.blobId,
          data_node_id: input.dataNodeId,
          state: 'pending'
        },
        data: {
          state: input.state,

          ...(input.state !== 'pending'
            ? {
                state_changed_at: new Date()
              }
            : {}),

          ...(input.verifiedAt !== undefined
            ? {
                last_verified_at: input.verifiedAt
              }
            : {})
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return repairUpdateResult.count === 1;
  }

  async applyPendingPartReplicaReconciliation(
    input: ApplyPendingPartReplicaReconciliationRepositoryInput
  ): Promise<boolean> {
    let reconciliationUpdateResult;

    try {
      reconciliationUpdateResult = await this.prisma.objectVersionPartReplica.updateMany({
        where: {
          blob_id: input.blobId,
          data_node_id: input.dataNodeId,
          state: 'pending'
        },
        data: {
          state: input.state,

          ...(input.state !== 'pending'
            ? {
                state_changed_at: new Date()
              }
            : {}),

          ...(input.verifiedAt !== undefined
            ? {
                last_verified_at: input.verifiedAt
              }
            : {})
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return reconciliationUpdateResult.count === 1;
  }

  async applyRedundantPartReplicaDeletion(input: ApplyRedundantPartReplicaDeletionRepositoryInput): Promise<boolean> {
    let replicaUpdateResult;

    try {
      replicaUpdateResult = await this.prisma.objectVersionPartReplica.updateMany({
        where: {
          blob_id: input.blobId,
          data_node_id: input.dataNodeId,
          state: input.expectedState
        },
        data: {
          state: 'deleting',
          state_changed_at: new Date()
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return replicaUpdateResult.count === 1;
  }

  /* update methods */

  async updatePartReplicaStates(input: UpdatePartReplicaStatesRepositoryInput): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        for (const replica of input) {
          const replicaUpdateResult = await tx.objectVersionPartReplica.updateMany({
            where: {
              blob_id: replica.blobId,
              data_node_id: replica.dataNodeId,
              state: replica.expectedState
            },
            data: {
              state: replica.state,

              ...(replica.state !== replica.expectedState
                ? {
                    state_changed_at: new Date()
                  }
                : {})
            }
          });

          if (replicaUpdateResult.count !== 1) {
            throw new GenericFailedPreconditionError('Part replica state changed unexpectedly');
          }
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }
  }

  /* touch methods */

  async touchPartReplicaVerificationCandidate(
    input: TouchPartReplicaVerificationCandidateRepositoryInput
  ): Promise<boolean> {
    let verificationCandidateUpdateResult;

    try {
      verificationCandidateUpdateResult = await this.prisma.objectVersionPartReplica.updateMany({
        where: {
          blob_id: input.blobId,
          data_node_id: input.dataNodeId,
          state: 'committed'
        },
        data: {
          state: 'committed'
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return verificationCandidateUpdateResult.count === 1;
  }

  async touchPartReplicaRepairCandidate(input: TouchPartReplicaRepairCandidateRepositoryInput): Promise<boolean> {
    let repairCandidateUpdateResult;

    try {
      repairCandidateUpdateResult = await this.prisma.objectVersionPartReplica.updateMany({
        where: {
          blob_id: input.blobId,
          data_node_id: input.dataNodeId,
          state: input.state
        },
        data: {
          state: input.state
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return repairCandidateUpdateResult.count === 1;
  }

  async touchPartReplicaDeletionCandidate(input: TouchPartReplicaDeletionCandidateRepositoryInput): Promise<boolean> {
    let deletionCandidateUpdateResult;

    try {
      deletionCandidateUpdateResult = await this.prisma.objectVersionPartReplica.updateMany({
        where: {
          blob_id: input.blobId,
          data_node_id: input.dataNodeId,
          state: 'deleting'
        },
        data: {
          state: 'deleting'
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return deletionCandidateUpdateResult.count === 1;
  }

  /* delete methods */

  async deletePartReplicaIfDeleting(input: DeletePartReplicaIfDeletingRepositoryInput): Promise<boolean> {
    let replicaDeleteResult;

    try {
      replicaDeleteResult = await this.prisma.objectVersionPartReplica.deleteMany({
        where: {
          blob_id: input.blobId,
          data_node_id: input.dataNodeId,
          state: 'deleting'
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return replicaDeleteResult.count === 1;
  }

  async deleteReplicaFreePartsByObjectVersion(
    input: DeleteReplicaFreePartsByObjectVersionRepositoryInput
  ): Promise<number> {
    let partDeleteResult;

    try {
      partDeleteResult = await this.prisma.objectVersionPart.deleteMany({
        where: {
          object_id: input.objectId,
          version: input.version,
          object_version: {
            state: 'deleting'
          },
          replicas: {
            none: {}
          }
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return partDeleteResult.count;
  }
}

/* exports */

export { ObjectVersionPartRepository };
export type { ObjectVersionPartRepositoryContract };
