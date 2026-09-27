/* types */

export type ElectionConfig = {
  timeoutMinMs: number;
  timeoutMaxMs: number;
};

/* config */

export const electionConfig: ElectionConfig = {
  timeoutMinMs: 5_000,
  timeoutMaxMs: 10_000
};
