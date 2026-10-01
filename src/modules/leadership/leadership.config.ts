/* types */

export type LeadershipConfig = {
  quorumLossTimeoutMs: number;
};

/* config */

export const leadershipConfig: LeadershipConfig = {
  quorumLossTimeoutMs: 10_000
};
