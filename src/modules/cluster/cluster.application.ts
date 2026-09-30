import type { Prisma } from '@prisma/client';
import { z } from 'zod';

import { clusterSchema } from './cluster.domain';

/* repository schemas */

export const createClusterRepositoryInputSchema = clusterSchema.pick({
  id: true,
  clusterId: true
});

/* types */

export type CreateClusterRepositoryInput = z.infer<typeof createClusterRepositoryInputSchema>;

// runs within the membership-revision transaction; all database work must use the provided transaction client.
export type MembershipRevisionTransactionAction<TResult> = (tx: Prisma.TransactionClient) => Promise<TResult>;
