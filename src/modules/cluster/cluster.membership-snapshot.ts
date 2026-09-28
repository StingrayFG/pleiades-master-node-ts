import { z } from 'zod';

import { dataNodeSchema } from '@/modules/data-nodes/data-node.domain';
import { masterNodeSchema } from '@/modules/master-nodes/master-node.domain';

import { clusterSchema } from './cluster.domain';

/* schemas */

export const clusterMembershipSnapshotSchema = z
  .object({
    cluster: clusterSchema,
    masterNodes: z.array(masterNodeSchema),
    dataNodes: z.array(dataNodeSchema)
  })
  .superRefine((snapshot, context) => {
    const masterNodeIds = new Set(snapshot.masterNodes.map((masterNode) => masterNode.id));
    const masterNodeFingerprints = new Set(snapshot.masterNodes.map((masterNode) => masterNode.certificateFingerprint));
    const dataNodeIds = new Set(snapshot.dataNodes.map((dataNode) => dataNode.id));
    const dataNodeFingerprints = new Set(snapshot.dataNodes.map((dataNode) => dataNode.certificateFingerprint));

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

    if (dataNodeIds.size !== snapshot.dataNodes.length) {
      context.addIssue({
        code: 'custom',
        message: 'Cluster membership snapshot contains duplicate data node IDs'
      });
    }

    if (dataNodeFingerprints.size !== snapshot.dataNodes.length) {
      context.addIssue({
        code: 'custom',
        message: 'Cluster membership snapshot contains duplicate data node certificates'
      });
    }
  });

/* types */

export type ClusterMembershipSnapshot = z.infer<typeof clusterMembershipSnapshotSchema>;
