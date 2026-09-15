import { dataNodeConfig } from '../data-node.config';
import type { DataNode, DataNodeState } from '../data-node.domain';

/* helpers */

const calculateDataNodeContactSilenceMs = (dataNode: DataNode, now: Date): number => {
  return Math.max(0, now.getTime() - dataNode.lastContactAt.getTime());
};

/* policies */

export const shouldCheckDataNodeHealth = (dataNode: DataNode, now: Date): boolean => {
  const contactSilenceMs = calculateDataNodeContactSilenceMs(dataNode, now);

  if (contactSilenceMs < dataNodeConfig.lifecycle.healthCheckAfterMs) {
    return false;
  }

  if (!dataNode.lastHealthCheckAt) {
    return true;
  }

  const healthCheckSilenceMs = Math.max(0, now.getTime() - dataNode.lastHealthCheckAt.getTime());

  return healthCheckSilenceMs >= dataNodeConfig.lifecycle.healthCheckIntervalMs;
};

export const resolveDataNodeStateFromContactSilence = (dataNode: DataNode, now: Date): DataNodeState => {
  const silenceMs = calculateDataNodeContactSilenceMs(dataNode, now);

  if (silenceMs < dataNodeConfig.lifecycle.offlineAfterMs) {
    return dataNode.state;
  }

  if (dataNode.state === 'failed') {
    return 'failed';
  }

  return 'offline';
};
