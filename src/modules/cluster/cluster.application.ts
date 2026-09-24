import { z } from 'zod';

import { clusterSchema } from './cluster.domain';

/* repository schemas */

export const createClusterRepositoryInputSchema = clusterSchema.pick({
  id: true,
  clusterId: true
});

/* types */

export type CreateClusterRepositoryInput = z.infer<typeof createClusterRepositoryInputSchema>;
