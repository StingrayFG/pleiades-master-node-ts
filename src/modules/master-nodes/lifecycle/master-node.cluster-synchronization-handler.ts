import { GenericFailedPreconditionError } from '@/errors/application.errors';
import type { ClusterServiceContract } from '@/modules/cluster/cluster.service';

import type { SynchronizeClusterMembershipInput } from '../master-node.application';
import type { MasterNodeGrpcClientContract } from '../master-node.grpc-client';

/* contract */

type MasterNodeClusterSynchronizationHandlerContract = {
  synchronize(input: SynchronizeClusterMembershipInput): Promise<void>;
};

/* handler */

class MasterNodeClusterSynchronizationHandler implements MasterNodeClusterSynchronizationHandlerContract {
  constructor(
    private readonly masterNodeGrpcClient: MasterNodeGrpcClientContract,
    private readonly clusterService: ClusterServiceContract
  ) {}

  // used by followers to apply membership changes announced by the current leader.
  async synchronize(input: SynchronizeClusterMembershipInput): Promise<void> {
    const cluster = await this.clusterService.getCluster();

    if (input.leaderMembershipRevision < cluster.membershipRevision) {
      throw new GenericFailedPreconditionError('The leader returned a regressed cluster membership revision');
    }

    if (input.leaderMembershipRevision === cluster.membershipRevision) {
      return;
    }

    const snapshot = await this.masterNodeGrpcClient.fetchClusterMembershipSnapshot({
      masterNodeEndpoint: input.masterNodeEndpoint,
      expectedCertificateFingerprint: input.expectedCertificateFingerprint
    });

    if (snapshot.cluster.membershipRevision < input.leaderMembershipRevision) {
      throw new GenericFailedPreconditionError('The leader returned a stale cluster membership snapshot');
    }

    await this.clusterService.applyMembershipSnapshot(snapshot);
  }
}

/* exports */

export { MasterNodeClusterSynchronizationHandler };
export type { MasterNodeClusterSynchronizationHandlerContract };
