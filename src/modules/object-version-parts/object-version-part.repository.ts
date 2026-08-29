import type { PrismaClient } from '@prisma/client';

import { mapPrismaError, type PrismaErrorMapperOverrides } from '@/database/prisma/error-mapper';

import type { BlobId } from '@/modules/blobs/blob.domain';
import type { ObjectId, ObjectVersionNumber } from '@/modules/objects/object.domain';

import type {
  CreatePartWithReplicasRepositoryInput,
  UpdateReplicaStatesRepositoryInput
} from './object-version-part.application';
import type { Part, PartReplica } from './object-version-part.domain';
import { mapPrismaPartReplicaToDomainPartReplica, mapPrismaPartToDomainPart } from './object-version-part.mappers';

/* contract */

type ObjectVersionPartRepositoryContract = {
  listPartsByObjectVersion(objectId: ObjectId, version: ObjectVersionNumber): Promise<Part[]>;
  listCommittedPartReplicasByBlobId(blobId: BlobId): Promise<PartReplica[]>;
  findPartByBlobId(blobId: BlobId): Promise<Part | null>;
  createPartWithReplicas(input: CreatePartWithReplicasRepositoryInput): Promise<Part>;
  updatePartReplicaStates(input: UpdateReplicaStatesRepositoryInput): Promise<void>;
};

/* repository */

const errorMap: PrismaErrorMapperOverrides = {};

class ObjectVersionPartRepository implements ObjectVersionPartRepositoryContract {
  constructor(private readonly prisma: PrismaClient) {}

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

  async createPartWithReplicas(input: CreatePartWithReplicasRepositoryInput): Promise<Part> {
    let part;

    try {
      part = await this.prisma.$transaction(async (tx) => {
        const createdPart = await tx.objectVersionPart.create({
          data: {
            blob_id: input.part.blobId,
            object_id: input.part.objectId,
            version: input.part.version,
            part_number: input.part.partNumber,
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

  async updatePartReplicaStates(input: UpdateReplicaStatesRepositoryInput): Promise<void> {
    try {
      await this.prisma.$transaction(
        input.map((replica) =>
          this.prisma.objectVersionPartReplica.update({
            where: {
              blob_id_data_node_id: {
                blob_id: replica.blobId,
                data_node_id: replica.dataNodeId
              }
            },
            data: {
              state: replica.state
            }
          })
        )
      );
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }
  }
}

/* exports */

export { ObjectVersionPartRepository };
export type { ObjectVersionPartRepositoryContract };
