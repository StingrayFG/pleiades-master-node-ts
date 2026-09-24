import type { PrismaClient } from '@prisma/client';

import { mapPrismaError, type PrismaErrorMapperOverrides } from '@/database/prisma/error-mapper';
import { GenericAlreadyExistsError } from '@/errors/application.errors';

import type { CreateClusterRepositoryInput } from './cluster.application';
import { CLUSTER_RECORD_ID, type Cluster } from './cluster.domain';
import { mapPrismaClusterToDomainCluster } from './cluster.mappers';

/* contract */

type ClusterRepositoryContract = {
  find(): Promise<Cluster | null>;
  create(input: CreateClusterRepositoryInput): Promise<Cluster>;
};

/* repository */

const errorMap: PrismaErrorMapperOverrides = {
  errors: {
    uniqueConstraintViolation: {
      createError: (message, cause) => new GenericAlreadyExistsError(message, { cause }),
      message: 'Cluster already exists'
    }
  }
};

class ClusterRepository implements ClusterRepositoryContract {
  constructor(private readonly prisma: PrismaClient) {}

  async find(): Promise<Cluster | null> {
    let cluster;

    try {
      cluster = await this.prisma.cluster.findUnique({
        where: {
          id: CLUSTER_RECORD_ID
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return cluster ? mapPrismaClusterToDomainCluster(cluster) : null;
  }

  async create(input: CreateClusterRepositoryInput): Promise<Cluster> {
    let cluster;

    try {
      cluster = await this.prisma.cluster.create({
        data: {
          id: input.id,
          cluster_id: input.clusterId
        }
      });
    } catch (err) {
      throw mapPrismaError(err, errorMap) ?? err;
    }

    return mapPrismaClusterToDomainCluster(cluster);
  }
}

/* exports */

export { ClusterRepository };
export type { ClusterRepositoryContract };
