import type { Prisma } from '@prisma/client';

import { GenericAbortedError, GenericFailedPreconditionError, GenericNotFoundError } from '@/errors/application.errors';
import type { ClusterServiceContract } from '@/modules/cluster/cluster.service';
import type { ConsensusLeadershipContext } from '@/modules/consensus/consensus.domain';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';

import type { ApplyMasterNodeHeartbeatInput, RegisterMasterNodeInput } from './master-node.application';
import type { MasterNode, MasterNodeId, MasterNodeMode, MasterNodeSessionId } from './master-node.domain';
import type { MasterNodeRepositoryContract } from './master-node.repository';

/* contract */

type MasterNodeServiceContract = {
  // queries
  listMasterNodes(): Promise<MasterNode[]>;
  getMasterNodeById(id: MasterNodeId): Promise<MasterNode>;

  // activity
  applyMasterNodeHeartbeat(input: ApplyMasterNodeHeartbeatInput): Promise<void>;

  // membership
  registerMasterNode(input: RegisterMasterNodeInput, tx?: Prisma.TransactionClient): Promise<MasterNode>;
  activateMasterNode(id: MasterNodeId, sessionId: MasterNodeSessionId): Promise<MasterNode>;
  transitionMasterNodeMode(id: MasterNodeId, mode: MasterNodeMode): Promise<MasterNode>;
};

/* service */

class MasterNodeService implements MasterNodeServiceContract {
  constructor(
    private readonly repository: MasterNodeRepositoryContract,
    private readonly consensusService: ConsensusServiceContract,
    private readonly clusterService: ClusterServiceContract,
    private readonly selfMasterNodeId: MasterNodeId
  ) {}

  /* query methods */

  async listMasterNodes(): Promise<MasterNode[]> {
    return this.repository.listAll();
  }

  async getMasterNodeById(id: MasterNodeId): Promise<MasterNode> {
    const masterNode = await this.repository.findMemberById(id);

    if (!masterNode) {
      throw new GenericNotFoundError('Master node not found');
    }

    return masterNode;
  }

  /* activity methods */

  async applyMasterNodeHeartbeat(input: ApplyMasterNodeHeartbeatInput): Promise<void> {
    const now = new Date();

    await this.repository.applyHeartbeat({
      ...input,
      lastContactAt: now,
      lastHeartbeatAt: now
    });
  }

  /* membership methods */

  async registerMasterNode(input: RegisterMasterNodeInput, tx?: Prisma.TransactionClient): Promise<MasterNode> {
    return this.clusterService.withAdvancedMembershipRevision(
      (membershipTx) =>
        this.repository.applyRegistration(
          {
            id: input.id,

            certificateFingerprint: input.certificateFingerprint,
            sessionId: input.sessionId,
            state: input.state,
            mode: input.mode,

            endpoint: input.endpoint,

            lastContactAt: new Date()
          },
          membershipTx
        ),
      tx
    );
  }

  async activateMasterNode(id: MasterNodeId, sessionId: MasterNodeSessionId): Promise<MasterNode> {
    const masterNode = await this.getMasterNodeById(id);

    if (masterNode.sessionId !== sessionId) {
      throw new GenericAbortedError('Master node activation was aborted because its session changed');
    }

    if (masterNode.state === 'active') {
      return masterNode;
    }

    if (masterNode.state !== 'joining') {
      throw new GenericFailedPreconditionError('Only a joining master node can be activated');
    }

    const failedActivation = new Error('Master node activation lost its concurrency gate');

    try {
      await this.clusterService.withAdvancedMembershipRevision(async (tx) => {
        const activated = await this.repository.activate(
          {
            id,
            sessionId,
            expectedRevision: masterNode.revision
          },
          tx
        );

        if (!activated) {
          throw failedActivation;
        }
      });
    } catch (err) {
      if (err !== failedActivation) {
        throw err;
      }

      const currentMasterNode = await this.getMasterNodeById(id);

      if (currentMasterNode.sessionId === sessionId && currentMasterNode.state === 'active') {
        return currentMasterNode;
      }

      throw new GenericAbortedError('Master node activation was aborted by a concurrent change');
    }

    return this.getMasterNodeById(id);
  }

  async transitionMasterNodeMode(id: MasterNodeId, mode: MasterNodeMode): Promise<MasterNode> {
    const consensusState = await this.consensusService.getConsensusState();

    if (consensusState.leaderMasterId !== this.selfMasterNodeId) {
      throw new GenericFailedPreconditionError(
        'Master node mode cannot be changed because this node is not the cluster leader'
      );
    }

    const masterNode = await this.getMasterNodeById(id);

    if (masterNode.mode === mode) {
      return masterNode;
    }

    // the transition is fenced on the leadership read above, so a leader deposed
    // mid-flight cannot land the membership change
    const leadershipContext: ConsensusLeadershipContext = {
      epoch: consensusState.currentEpoch,
      leaderMasterId: this.selfMasterNodeId
    };

    const failedTransition = new Error('Master node mode transition lost its concurrency gate');

    try {
      await this.consensusService.withLeadershipContext(leadershipContext, (tx) =>
        this.clusterService.withAdvancedMembershipRevision(async (membershipTx) => {
          const transitioned = await this.repository.transitionMode(
            {
              id,
              from: masterNode.mode,
              to: mode,
              expectedRevision: masterNode.revision
            },
            membershipTx
          );

          if (!transitioned) {
            // abort the transaction so the membership revision is not advanced.
            throw failedTransition;
          }
        }, tx)
      );
    } catch (err) {
      if (err !== failedTransition) {
        throw err;
      }

      const currentMasterNode = await this.getMasterNodeById(id);

      if (currentMasterNode.mode === mode) {
        return currentMasterNode;
      }

      throw new GenericAbortedError('Master node mode transition was aborted by a concurrent change');
    }

    const updatedMasterNode = await this.getMasterNodeById(id);

    if (updatedMasterNode.mode !== mode) {
      throw new GenericAbortedError('Master node mode changed again before the transition completed');
    }

    return updatedMasterNode;
  }
}

/* exports */

export { MasterNodeService };
export type { MasterNodeServiceContract };
