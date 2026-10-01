import type { DataNodeHealthSnapshot, DataNodeState } from './data-node.domain';

/* policies */

export const resolveDataNodeState = (healthSnapshot: DataNodeHealthSnapshot): DataNodeState => {
  if (!healthSnapshot.databaseOk || !healthSnapshot.storageOk) {
    return 'failed';
  }

  if (healthSnapshot.status === 'healthy') {
    return 'active';
  }

  return 'failed';
};
