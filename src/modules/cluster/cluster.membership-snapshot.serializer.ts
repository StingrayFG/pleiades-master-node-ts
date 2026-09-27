import { Buffer } from 'node:buffer';

import { z } from 'zod';

import { withMapperError } from '@/common/mappers/mappers';
import { jsonBigIntCodec } from '@/common/serializers/bigint.serializer';
import { jsonDateCodec } from '@/common/serializers/date.serializer';
import { masterNodeSchema } from '@/modules/master-nodes/master-node.domain';

import { clusterSchema } from './cluster.domain';
import { clusterMembershipSnapshotSchema, type ClusterMembershipSnapshot } from './cluster.membership-snapshot';

/* codecs */

const clusterMembershipSnapshotJsonCodec = z.object({
  cluster: clusterSchema.extend({
    membershipRevision: jsonBigIntCodec,
    createdAt: jsonDateCodec,
    updatedAt: jsonDateCodec
  }),
  masterNodes: z.array(
    masterNodeSchema.extend({
      registeredAt: jsonDateCodec,
      lastContactAt: jsonDateCodec,
      lastHealthCheckAt: jsonDateCodec.nullable(),
      lastHeartbeatAt: jsonDateCodec.nullable(),
      updatedAt: jsonDateCodec,
      revision: jsonBigIntCodec
    })
  )
});

/* serializer */

export const serializeClusterMembershipSnapshot = (snapshot: ClusterMembershipSnapshot): Buffer => {
  return withMapperError('Failed to serialize cluster membership snapshot', () => {
    const parsedSnapshot = clusterMembershipSnapshotSchema.parse(snapshot);

    return Buffer.from(JSON.stringify(z.encode(clusterMembershipSnapshotJsonCodec, parsedSnapshot)));
  });
};

export const parseClusterMembershipSnapshot = (bytes: Buffer): ClusterMembershipSnapshot => {
  return withMapperError('Failed to parse cluster membership snapshot', () => {
    const snapshot = z.decode(clusterMembershipSnapshotJsonCodec, JSON.parse(bytes.toString('utf8')));

    return clusterMembershipSnapshotSchema.parse(snapshot);
  });
};
