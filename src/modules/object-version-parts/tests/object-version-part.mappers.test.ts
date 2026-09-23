import type {
  ObjectVersionPart as PrismaObjectVersionPart,
  ObjectVersionPartReplica as PrismaObjectVersionPartReplica
} from '@prisma/client';
import { describe, expect, test } from '@jest/globals';

import { GenericMapperError } from '@/errors/application.errors';
import { BLOB_CHECKSUM_ALGORITHM } from '@/modules/blobs/blob.domain';

import type { Part, PartReplica } from '../object-version-part.domain';
import { mapPrismaPartReplicaToDomainPartReplica, mapPrismaPartToDomainPart } from '../object-version-part.mappers';

/* fixtures */

const now = new Date('2026-01-01T00:00:00.000Z');

const prismaPart: PrismaObjectVersionPart = {
  object_id: '00000000-0000-4000-8000-000000000001',
  version: 1,
  part_number: 1,
  blob_id: '00000000-0000-4000-8000-000000000002',
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
  blob_id: part.blobId,
  data_node_id: 'data-node-test',
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

/* tests */

describe('object version part mappers', () => {
  test('maps Prisma parts and replicas to domain entities', () => {
    expect(mapPrismaPartToDomainPart(prismaPart)).toEqual(part);
    expect(mapPrismaPartReplicaToDomainPartReplica(prismaReplica)).toEqual(replica);
  });

  test('wraps invalid Prisma rows in mapper errors', () => {
    expect(() => mapPrismaPartToDomainPart({ ...prismaPart, part_number: 0 })).toThrow(GenericMapperError);
    expect(() =>
      mapPrismaPartReplicaToDomainPartReplica({ ...prismaReplica, state: 'pending', data_node_id: '' })
    ).toThrow(GenericMapperError);
  });
});
