import type {
  ObjectVersionPart as PrismaObjectVersionPart,
  ObjectVersionPartReplica as PrismaObjectVersionPartReplica
} from '@prisma/client';

import { wrapMapping } from '@/common/mappers/mapping';

import { type Part, type PartReplica, partReplicaSchema, partSchema } from './object-version-part.domain';

/* prisma -> domain */

export const mapPrismaPartToDomainPart = (part: PrismaObjectVersionPart): Part => {
  return wrapMapping('Failed to map Prisma object version part to domain object version part', () =>
    partSchema.parse({
      blobId: part.blob_id,
      objectId: part.object_id,
      version: part.version,
      partNumber: part.part_number,
      placementGroup: part.placement_group,
      sizeBytes: part.size_bytes,
      checksumAlgorithm: part.checksum_algorithm,
      checksumValue: part.checksum_value,
      createdAt: part.created_at
    })
  );
};

export const mapPrismaPartReplicaToDomainPartReplica = (partReplica: PrismaObjectVersionPartReplica): PartReplica => {
  return wrapMapping('Failed to map Prisma object version part replica to domain object version part replica', () =>
    partReplicaSchema.parse({
      blobId: partReplica.blob_id,
      dataNodeId: partReplica.data_node_id,
      state: partReplica.state,
      lastVerifiedAt: partReplica.last_verified_at,
      createdAt: partReplica.created_at,
      updatedAt: partReplica.updated_at
    })
  );
};
