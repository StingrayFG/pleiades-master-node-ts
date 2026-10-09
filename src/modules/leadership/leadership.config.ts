/* types */

export type LeadershipConfig = {
  barrierFailureTimeoutMs: number;
  quorumLossTimeoutMs: number;
};

/* config */

export const leadershipConfig: LeadershipConfig = {
  barrierFailureTimeoutMs: 10_000,
  quorumLossTimeoutMs: 10_000
};
