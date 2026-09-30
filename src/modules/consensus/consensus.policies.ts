import type { RequestConsensusVoteInput } from './consensus.application';

/* policies */

export const isElectionStarterLogUpToDate = (input: RequestConsensusVoteInput): boolean => {
  return (
    input.electionStarterLastLogEpoch > input.localLastLogEpoch ||
    (input.electionStarterLastLogEpoch === input.localLastLogEpoch &&
      input.electionStarterLastLogSequence >= input.localLastLogSequence)
  );
};
