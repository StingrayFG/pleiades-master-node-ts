import { z } from 'zod';

import { masterNodeSchema } from '@/modules/master-nodes/master-node.domain';

import { clusterSchema } from './cluster.domain';

/* schemas */

export const clusterMembershipSnapshotSchema = z
  .object({
    cluster: clusterSchema,
    masterNodes: z.array(masterNodeSchema)
  })
  .superRefine((snapshot, context) => {
    const masterNodeIds = new Set(snapshot.masterNodes.map((masterNode) => masterNode.id));
    const masterNodeFingerprints = new Set(snapshot.masterNodes.map((masterNode) => masterNode.certificateFingerprint));

    if (masterNodeIds.size !== snapshot.masterNodes.length) {
      context.addIssue({
        code: 'custom',
        message: 'Cluster membership snapshot contains duplicate master node IDs'
      });
    }

    if (masterNodeFingerprints.size !== snapshot.masterNodes.length) {
      context.addIssue({
        code: 'custom',
        message: 'Cluster membership snapshot contains duplicate master node certificates'
      });
    }
  });

/* types */

export type ClusterMembershipSnapshot = z.infer<typeof clusterMembershipSnapshotSchema>;
