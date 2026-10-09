import type { Prisma } from '@prisma/client';
import { z } from 'zod';

import { clusterIdSchema, clusterRecordIdSchema } from './cluster.domain';

/* schemas */

export const createClusterRepositoryInputSchema = z.object({
  id: clusterRecordIdSchema,
  clusterId: clusterIdSchema
});

/* types */

export type CreateClusterRepositoryInput = z.infer<typeof createClusterRepositoryInputSchema>;

// transaction action callbacks use direct types because their Prisma transaction client cannot be schema-derived.

// runs as part of the membership-revision transaction and receives the same transaction client.
export type MembershipRevisionTransactionAction<TResult> = (tx: Prisma.TransactionClient) => Promise<TResult>;
