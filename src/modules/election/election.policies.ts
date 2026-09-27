import type { MasterNode } from '@/modules/master-nodes/master-node.domain';

import type { ElectionConfig } from './election.config';

// unavailable members remain voters until explicitly removed.
// quorum must never shrink automatically based on liveness.
export const isMasterNodeVotingMember = (masterNode: MasterNode): boolean => {
  return masterNode.state !== 'joining';
};

export const isMasterNodeEligibleCandidate = (masterNode: MasterNode): boolean => {
  return masterNode.state === 'active' && masterNode.mode === 'serving';
};

export const resolveElectionQuorumSize = (voterCount: number): number => {
  return Math.floor(voterCount / 2) + 1;
};

export const resolveElectionTimeoutMs = (config: ElectionConfig): number => {
  const range = config.timeoutMaxMs - config.timeoutMinMs + 1;

  return config.timeoutMinMs + Math.floor(Math.random() * range);
};
