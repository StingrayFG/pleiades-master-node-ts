import type { DataNodeHealthSnapshot, DataNodeState } from './data-node.domain';

/* data node state */

export const resolveDataNodeState = (healthSnapshot: DataNodeHealthSnapshot): DataNodeState => {
  if (!healthSnapshot.databaseOk || !healthSnapshot.storageOk) {
    return 'failed';
  }

  if (healthSnapshot.status === 'healthy') {
    return 'active';
  }

  return 'failed';
};
