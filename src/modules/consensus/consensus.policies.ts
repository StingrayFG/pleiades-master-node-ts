import type { MasterNodeId } from '@/modules/master-nodes/master-node.domain';

import type { RequestConsensusVoteInput } from './consensus.application';
import type { ConsensusLastSequence, ConsensusVotingConfiguration } from './consensus.domain';

/* policies */

export const isElectionStarterLogUpToDate = (input: RequestConsensusVoteInput): boolean => {
  return (
    input.electionStarterLastLogEpoch > input.localLastLogEpoch ||
    (input.electionStarterLastLogEpoch === input.localLastLogEpoch &&
      input.electionStarterLastLogSequence >= input.localLastLogSequence)
  );
};

export const listConsensusVoterMasterNodeIds = (configuration: ConsensusVotingConfiguration): MasterNodeId[] => {
  if (configuration.phase === 'stable') {
    return configuration.voterMasterNodeIds;
  }

  return [...new Set([...configuration.previousVoterMasterNodeIds, ...configuration.nextVoterMasterNodeIds])];
};

export const isConsensusVoter = (configuration: ConsensusVotingConfiguration, masterNodeId: MasterNodeId): boolean => {
  return listConsensusVoterMasterNodeIds(configuration).includes(masterNodeId);
};

const haveSameVoters = (left: MasterNodeId[], right: MasterNodeId[]): boolean => {
  if (left.length !== right.length) {
    return false;
  }

  const rightVoters = new Set(right);

  return left.every((id) => rightVoters.has(id));
};

export const areConsensusVotingConfigurationsEqual = (
  left: ConsensusVotingConfiguration,
  right: ConsensusVotingConfiguration
): boolean => {
  if (left.phase !== right.phase) {
    return false;
  }

  if (left.phase === 'stable' && right.phase === 'stable') {
    return haveSameVoters(left.voterMasterNodeIds, right.voterMasterNodeIds);
  }

  if (left.phase === 'joint' && right.phase === 'joint') {
    return (
      haveSameVoters(left.previousVoterMasterNodeIds, right.previousVoterMasterNodeIds) &&
      haveSameVoters(left.nextVoterMasterNodeIds, right.nextVoterMasterNodeIds)
    );
  }

  return false;
};

const resolveQuorumSize = (voterCount: number): number => Math.floor(voterCount / 2) + 1;

const hasVoterSetQuorum = (voterMasterNodeIds: MasterNodeId[], acceptedMasterNodeIds: Set<MasterNodeId>): boolean => {
  const acceptedCount = voterMasterNodeIds.filter((id) => acceptedMasterNodeIds.has(id)).length;

  return acceptedCount >= resolveQuorumSize(voterMasterNodeIds.length);
};

export const hasConsensusVotingQuorum = (
  configuration: ConsensusVotingConfiguration,
  acceptedMasterNodeIds: Iterable<MasterNodeId>
): boolean => {
  const acceptedIds = new Set(acceptedMasterNodeIds);

  if (configuration.phase === 'stable') {
    return hasVoterSetQuorum(configuration.voterMasterNodeIds, acceptedIds);
  }

  return (
    hasVoterSetQuorum(configuration.previousVoterMasterNodeIds, acceptedIds) &&
    hasVoterSetQuorum(configuration.nextVoterMasterNodeIds, acceptedIds)
  );
};

const resolveVoterSetQuorumSequence = (
  voterMasterNodeIds: MasterNodeId[],
  matchedSequencesByMasterNodeId: ReadonlyMap<MasterNodeId, ConsensusLastSequence>
): ConsensusLastSequence => {
  const matchedSequences = voterMasterNodeIds
    .map((id) => matchedSequencesByMasterNodeId.get(id) ?? -1n)
    .sort((left, right) => (left > right ? -1 : left < right ? 1 : 0));

  return matchedSequences[resolveQuorumSize(voterMasterNodeIds.length) - 1];
};

export const resolveConsensusQuorumSequence = (
  configuration: ConsensusVotingConfiguration,
  matchedSequencesByMasterNodeId: ReadonlyMap<MasterNodeId, ConsensusLastSequence>
): ConsensusLastSequence => {
  if (configuration.phase === 'stable') {
    return resolveVoterSetQuorumSequence(configuration.voterMasterNodeIds, matchedSequencesByMasterNodeId);
  }

  const previousQuorumSequence = resolveVoterSetQuorumSequence(
    configuration.previousVoterMasterNodeIds,
    matchedSequencesByMasterNodeId
  );
  const nextQuorumSequence = resolveVoterSetQuorumSequence(
    configuration.nextVoterMasterNodeIds,
    matchedSequencesByMasterNodeId
  );

  return previousQuorumSequence < nextQuorumSequence ? previousQuorumSequence : nextQuorumSequence;
};
