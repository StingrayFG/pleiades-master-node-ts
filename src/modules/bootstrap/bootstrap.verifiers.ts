import { GenericConflictError } from '@/errors/application.errors';
import type { ClusterMembershipSnapshot } from '@/modules/cluster/cluster.membership-snapshot';
import type { ConsensusState } from '@/modules/consensus/consensus.domain';
import type {
  FetchMasterInfoInternodeResult,
  RegisterMasterNodeInput
} from '@/modules/master-nodes/master-node.application';
import type { MasterNodeCertificateFingerprint, MasterNodeId } from '@/modules/master-nodes/master-node.domain';

/* leader bootstrap verifiers */

export const verifyLeaderBootstrapAvailable = (state: ConsensusState, selfMasterNodeId: MasterNodeId): void => {
  if (state.leaderMasterId === selfMasterNodeId) {
    throw new GenericConflictError('This master node is already the cluster leader');
  }

  if (state.leaderMasterId !== null) {
    throw new GenericConflictError('Another master node is already the cluster leader');
  }
};

export const verifyInitialLeadershipClaimed = (state: ConsensusState, selfMasterNodeId: MasterNodeId): void => {
  if (state.leaderMasterId !== selfMasterNodeId) {
    throw new GenericConflictError('Another master node claimed the cluster leadership first');
  }
};

/* follower bootstrap verifiers */

export const verifyFollowerBootstrapAvailable = (state: ConsensusState, selfMasterNodeId: MasterNodeId): void => {
  if (state.leaderMasterId === selfMasterNodeId) {
    throw new GenericConflictError('This master node is the cluster leader and cannot become a follower');
  }
};

export const verifyFollowerBootstrapTarget = (
  state: ConsensusState,
  leaderMasterId: MasterNodeId,
  selfMasterNodeId: MasterNodeId
): void => {
  if (leaderMasterId === selfMasterNodeId) {
    throw new GenericConflictError('A master node cannot follow itself');
  }

  if (state.leaderMasterId !== null && state.leaderMasterId !== leaderMasterId) {
    throw new GenericConflictError('This master node already belongs to a different leader');
  }
};

/* membership snapshot verifiers */

export const verifyBootstrapMembershipSnapshot = (
  snapshot: ClusterMembershipSnapshot,
  leaderInfo: FetchMasterInfoInternodeResult,
  leaderCertificateFingerprint: MasterNodeCertificateFingerprint,
  selfMasterNode: Omit<RegisterMasterNodeInput, 'state' | 'mode'>
): void => {
  const snapshotLeader = snapshot.masterNodes.find((masterNode) => masterNode.id === leaderInfo.masterId);
  const snapshotSelf = snapshot.masterNodes.find((masterNode) => masterNode.id === selfMasterNode.id);

  if (
    !snapshotLeader ||
    snapshotLeader.certificateFingerprint !== leaderCertificateFingerprint ||
    snapshotLeader.sessionId !== leaderInfo.sessionId
  ) {
    throw new GenericConflictError('Cluster membership snapshot does not match the authenticated leader');
  }

  if (
    !snapshotSelf ||
    snapshotSelf.certificateFingerprint !== selfMasterNode.certificateFingerprint ||
    snapshotSelf.sessionId !== selfMasterNode.sessionId
  ) {
    throw new GenericConflictError('Cluster membership snapshot does not contain the registered local master node');
  }
};
