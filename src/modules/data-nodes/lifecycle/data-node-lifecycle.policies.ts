import type { DataNode, DataNodeState } from '../data-node.domain';

/* constants */

const DATA_NODE_OFFLINE_AFTER_MS = 10 * 60 * 1000;
const DATA_NODE_HEALTH_CHECK_AFTER_MS = 60 * 60 * 1000;
const DATA_NODE_HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1000;

/* helpers */

const calculateDataNodeContactSilenceMs = (dataNode: DataNode, now: Date): number => {
  return Math.max(0, now.getTime() - dataNode.lastContactAt.getTime());
};

/* policies */

export const shouldCheckDataNodeHealth = (dataNode: DataNode, now: Date): boolean => {
  const contactSilenceMs = calculateDataNodeContactSilenceMs(dataNode, now);

  if (contactSilenceMs < DATA_NODE_HEALTH_CHECK_AFTER_MS) {
    return false;
  }

  if (!dataNode.lastHealthCheckAt) {
    return true;
  }

  const healthCheckSilenceMs = Math.max(0, now.getTime() - dataNode.lastHealthCheckAt.getTime());

  return healthCheckSilenceMs >= DATA_NODE_HEALTH_CHECK_INTERVAL_MS;
};

export const resolveDataNodeStateFromContactSilence = (dataNode: DataNode, now: Date): DataNodeState => {
  const silenceMs = calculateDataNodeContactSilenceMs(dataNode, now);

  if (silenceMs < DATA_NODE_OFFLINE_AFTER_MS) {
    return dataNode.state;
  }

  if (dataNode.state === 'failed') {
    return 'failed';
  }

  return 'offline';
};
