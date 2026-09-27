import { z } from 'zod';

/* constants */

export const CLUSTER_RECORD_ID = 'self';

/* field schemas */

export const clusterRecordIdSchema = z.literal(CLUSTER_RECORD_ID);
export const clusterIdSchema = z.uuid();
export const clusterMembershipRevisionSchema = z.bigint().nonnegative();

/* entity schemas */

export const clusterSchema = z.object({
  id: clusterRecordIdSchema,
  clusterId: clusterIdSchema,
  membershipRevision: clusterMembershipRevisionSchema,

  createdAt: z.date(),
  updatedAt: z.date()
});

/* types */

export type ClusterRecordId = z.infer<typeof clusterRecordIdSchema>;
export type ClusterId = z.infer<typeof clusterIdSchema>;
export type ClusterMembershipRevision = z.infer<typeof clusterMembershipRevisionSchema>;
export type Cluster = z.infer<typeof clusterSchema>;
