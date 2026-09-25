/* types */

export type MasterNodeReplicationConfig = {
  batchSize: number;
};

export type MasterNodeConfig = {
  replication: MasterNodeReplicationConfig;
};

/* config */

export const masterNodeConfig: MasterNodeConfig = {
  replication: {
    batchSize: 32
  }
};
