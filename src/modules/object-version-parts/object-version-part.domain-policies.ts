import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

import type { BlobId, DataNodeBlobState } from '@/modules/blobs/blob.domain';
import type { DataNode, DataNodeId } from '@/modules/data-nodes/data-node.domain';

import { type PlacementGroup, type PartReplicaState } from './object-version-part.domain';

/* replica and blob states */

const partReplicaStateByDataNodeBlobState = {
  pending: 'pending',
  temp: 'pending',
  committed: 'committed',
  deleting: 'deleting',
  corrupt: 'corrupt',
  missing: 'missing'
} as const satisfies Record<DataNodeBlobState, PartReplicaState>;

export const mapDataNodeBlobStateToPartReplicaState = (state: DataNodeBlobState): PartReplicaState => {
  return partReplicaStateByDataNodeBlobState[state];
};

/* placement groups and data nodes */

export const calculatePartPlacementGroup = (blobId: BlobId, placementGroupCount: number): PlacementGroup => {
  const blobIdHash = createHash('sha256').update(blobId).digest();

  return blobIdHash.readUInt32BE(0) % placementGroupCount;
};

const calculateDataNodePlacementScore = (placementGroup: PlacementGroup, dataNodeId: DataNodeId): Buffer => {
  return createHash('sha256').update(`${placementGroup}:${dataNodeId}`).digest();
};

export const selectResponsibleDataNodes = (
  placementGroup: PlacementGroup,
  replicationFactor: number,
  candidateDataNodes: readonly DataNode[]
): DataNode[] => {
  const rankedDataNodes = candidateDataNodes
    .map((dataNode) => ({
      dataNode,
      score: calculateDataNodePlacementScore(placementGroup, dataNode.id)
    }))
    .sort((left, right) => {
      const scoreOrder = Buffer.compare(right.score, left.score);

      return scoreOrder !== 0 ? scoreOrder : left.dataNode.id.localeCompare(right.dataNode.id);
    });

  return rankedDataNodes.slice(0, replicationFactor).map(({ dataNode }) => dataNode);
};
