import { describe, expect, test } from '@jest/globals';

import { GenericConflictError } from '@/errors/application.errors';
import { CLUSTER_RECORD_ID, type Cluster } from '@/modules/cluster/cluster.domain';
import type { ClusterMembershipSnapshot } from '@/modules/cluster/cluster.membership-snapshot';
import { CONSENSUS_STATE_ID, type ConsensusState } from '@/modules/consensus/consensus.domain';
import type {
  FetchMasterInfoInternodeResult,
  RegisterMasterNodeInput
} from '@/modules/master-nodes/master-node.application';
import type { MasterNode } from '@/modules/master-nodes/master-node.domain';

import {
  verifyBootstrapMembershipSnapshot,
  verifyFollowerBootstrapAvailable,
  verifyFollowerBootstrapTarget,
  verifyInitialLeadershipClaimed,
  verifyLeaderBootstrapAvailable
} from '../bootstrap.verifiers';

/* fixtures */

const now = new Date('2026-01-01T00:00:00.000Z');
const selfMasterNodeId = 'master-node-a';
const leaderMasterNodeId = 'master-node-b';

const unclaimedState: ConsensusState = {
  id: CONSENSUS_STATE_ID,
  currentEpoch: 2n,
  leaderMasterId: null,
  votedForMasterId: null,
  lastLeaderContactAt: null,
  lastAllocatedSequence: -1n,
  lastMatchedSequence: -1n,
  lastCommittedSequence: -1n,
  lastAppliedSequence: -1n,
  createdAt: now,
  updatedAt: now,
  revision: 0n
};

const leaderState: ConsensusState = {
  ...unclaimedState,
  leaderMasterId: leaderMasterNodeId,
  votedForMasterId: leaderMasterNodeId,
  lastLeaderContactAt: now
};

const selfLeaderState: ConsensusState = {
  ...unclaimedState,
  leaderMasterId: selfMasterNodeId,
  votedForMasterId: selfMasterNodeId,
  lastLeaderContactAt: now
};

const selfMasterNode: Omit<RegisterMasterNodeInput, 'state' | 'mode'> = {
  id: selfMasterNodeId,
  certificateFingerprint: 'ab'.repeat(32),
  sessionId: '00000000-0000-4000-8000-000000000001',
  endpoint: {
    hostname: 'master-node-a.internal',
    port: 4410,
    scheme: 'grpcs'
  }
};

const leaderMasterNode: MasterNode = {
  id: leaderMasterNodeId,
  certificateFingerprint: 'cd'.repeat(32),
  sessionId: '00000000-0000-4000-8000-000000000002',
  state: 'active',
  mode: 'serving',
  hostname: 'master-node-b.internal',
  port: 4410,
  scheme: 'grpcs',
  registeredAt: now,
  lastContactAt: now,
  lastHealthCheckAt: null,
  lastHeartbeatAt: null,
  updatedAt: now,
  revision: 1n
};

const selfMasterNodeMember: MasterNode = {
  ...leaderMasterNode,
  id: selfMasterNode.id,
  certificateFingerprint: selfMasterNode.certificateFingerprint,
  sessionId: selfMasterNode.sessionId,
  hostname: selfMasterNode.endpoint.hostname,
  port: selfMasterNode.endpoint.port,
  scheme: selfMasterNode.endpoint.scheme
};

const cluster: Cluster = {
  id: CLUSTER_RECORD_ID,
  clusterId: '00000000-0000-4000-8000-000000000010',
  membershipRevision: 1n,
  createdAt: now,
  updatedAt: now
};

const clusterMembershipSnapshot: ClusterMembershipSnapshot = {
  cluster,
  masterNodes: [leaderMasterNode, selfMasterNodeMember],
  dataNodes: []
};

const leaderInfo: FetchMasterInfoInternodeResult = {
  masterId: leaderMasterNodeId,
  sessionId: leaderMasterNode.sessionId,
  clusterId: cluster.clusterId,
  epoch: 4n
};

const leaderCertificateFingerprint = leaderMasterNode.certificateFingerprint;

/* tests */

describe('verifyLeaderBootstrapAvailable', () => {
  test('accepts an unclaimed consensus state', () => {
    expect(() => verifyLeaderBootstrapAvailable(unclaimedState, selfMasterNodeId)).not.toThrow();
  });

  test('rejects when the local master node is already the leader', () => {
    expect(() => verifyLeaderBootstrapAvailable(selfLeaderState, selfMasterNodeId)).toThrow(GenericConflictError);
  });

  test('rejects when another master node is already the leader', () => {
    expect(() => verifyLeaderBootstrapAvailable(leaderState, selfMasterNodeId)).toThrow(GenericConflictError);
  });
});

describe('verifyInitialLeadershipClaimed', () => {
  test('accepts a claim held by the bootstrapping node', () => {
    expect(() => verifyInitialLeadershipClaimed(selfLeaderState, selfMasterNodeId)).not.toThrow();
  });

  test('rejects a claim held by another master node', () => {
    expect(() => verifyInitialLeadershipClaimed(leaderState, selfMasterNodeId)).toThrow(GenericConflictError);
  });
});

describe('verifyFollowerBootstrapAvailable', () => {
  test('accepts a node that is not the leader', () => {
    expect(() => verifyFollowerBootstrapAvailable(unclaimedState, selfMasterNodeId)).not.toThrow();
    expect(() => verifyFollowerBootstrapAvailable(leaderState, selfMasterNodeId)).not.toThrow();
  });

  test('rejects when the local master node is the leader', () => {
    expect(() => verifyFollowerBootstrapAvailable(selfLeaderState, selfMasterNodeId)).toThrow(GenericConflictError);
  });
});

describe('verifyFollowerBootstrapTarget', () => {
  test('accepts a different leader while unclaimed or already following it', () => {
    expect(() => verifyFollowerBootstrapTarget(unclaimedState, leaderMasterNodeId, selfMasterNodeId)).not.toThrow();
    expect(() => verifyFollowerBootstrapTarget(leaderState, leaderMasterNodeId, selfMasterNodeId)).not.toThrow();
  });

  test('rejects following the local master node itself', () => {
    expect(() => verifyFollowerBootstrapTarget(unclaimedState, selfMasterNodeId, selfMasterNodeId)).toThrow(
      GenericConflictError
    );
  });

  test('rejects a leader that conflicts with the current one', () => {
    expect(() => verifyFollowerBootstrapTarget(selfLeaderState, leaderMasterNodeId, selfMasterNodeId)).toThrow(
      GenericConflictError
    );
  });
});

describe('verifyBootstrapMembershipSnapshot', () => {
  test('accepts a snapshot matching the leader and containing the local master node', () => {
    expect(() =>
      verifyBootstrapMembershipSnapshot(clusterMembershipSnapshot, leaderInfo, leaderCertificateFingerprint, selfMasterNode)
    ).not.toThrow();
  });

  test('rejects a snapshot missing the leader or mismatching its identity', () => {
    const snapshotWithoutLeader: ClusterMembershipSnapshot = {
      ...clusterMembershipSnapshot,
      masterNodes: [selfMasterNodeMember]
    };

    expect(() =>
      verifyBootstrapMembershipSnapshot(snapshotWithoutLeader, leaderInfo, leaderCertificateFingerprint, selfMasterNode)
    ).toThrow(GenericConflictError);
    expect(() =>
      verifyBootstrapMembershipSnapshot(
        clusterMembershipSnapshot,
        leaderInfo,
        'ef'.repeat(32),
        selfMasterNode
      )
    ).toThrow(GenericConflictError);
  });

  test('rejects a snapshot missing the local master node or mismatching its identity', () => {
    const snapshotWithoutSelf: ClusterMembershipSnapshot = {
      ...clusterMembershipSnapshot,
      masterNodes: [leaderMasterNode]
    };

    expect(() =>
      verifyBootstrapMembershipSnapshot(snapshotWithoutSelf, leaderInfo, leaderCertificateFingerprint, selfMasterNode)
    ).toThrow(GenericConflictError);

    const snapshotWithStaleSelf: ClusterMembershipSnapshot = {
      ...clusterMembershipSnapshot,
      masterNodes: [
        leaderMasterNode,
        { ...selfMasterNodeMember, sessionId: '00000000-0000-4000-8000-000000000099' }
      ]
    };

    expect(() =>
      verifyBootstrapMembershipSnapshot(snapshotWithStaleSelf, leaderInfo, leaderCertificateFingerprint, selfMasterNode)
    ).toThrow(GenericConflictError);
  });
});
