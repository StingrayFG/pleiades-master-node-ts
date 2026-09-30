import type { RequestConsensusVoteInput } from './consensus.application';

export const isCandidateLogUpToDate = (input: RequestConsensusVoteInput): boolean => {
  return (
    input.candidateLastLogEpoch > input.localLastLogEpoch ||
    (input.candidateLastLogEpoch === input.localLastLogEpoch &&
      input.candidateLastLogSequence >= input.localLastLogSequence)
  );
};
