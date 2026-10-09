import type { ConsensusVotingConfiguration } from '@/modules/consensus/consensus.domain';
import { isConsensusVoter } from '@/modules/consensus/consensus.policies';
import type { MasterNode } from '@/modules/master-nodes/master-node.domain';

import type { ElectionConfig } from './election.config';

// unavailable members remain voters until explicitly removed.
// quorum must never shrink automatically based on liveness.
export const isMasterNodeEligibleForElection = (masterNode: MasterNode): boolean => {
  return masterNode.state === 'active' && masterNode.mode === 'serving';
};

export const isSelfMasterNodeEligibleForElection = (
  selfMasterNode: MasterNode | undefined,
  votingConfiguration: ConsensusVotingConfiguration
): boolean => {
  return (
    selfMasterNode !== undefined &&
    isConsensusVoter(votingConfiguration, selfMasterNode.id) &&
    isMasterNodeEligibleForElection(selfMasterNode)
  );
};

export const resolveElectionTimeoutMs = (config: ElectionConfig): number => {
  const range = config.timeoutMaxMs - config.timeoutMinMs + 1;

  return config.timeoutMinMs + Math.floor(Math.random() * range);
};
