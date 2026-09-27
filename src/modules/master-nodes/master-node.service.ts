import {
  GenericAbortedError,
  GenericConflictError,
  GenericFailedPreconditionError,
  GenericNotFoundError
} from '@/errors/application.errors';
import type { ClusterServiceContract } from '@/modules/cluster/cluster.service';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';

import type { ApplyMasterNodeRegistrationRepositoryInput, RegisterMasterNodeInput } from './master-node.application';
import type { MasterNode, MasterNodeId, MasterNodeMode } from './master-node.domain';
import type { MasterNodeRepositoryContract } from './master-node.repository';

/* contract */

type MasterNodeServiceContract = {
  listMasterNodes(): Promise<MasterNode[]>;
  getMasterNodeById(id: MasterNodeId): Promise<MasterNode>;
  registerMasterNode(input: RegisterMasterNodeInput): Promise<MasterNode>;
  setMasterNodeMode(id: MasterNodeId, mode: MasterNodeMode): Promise<MasterNode>;
};

/* service */

class MasterNodeService implements MasterNodeServiceContract {
  constructor(
    private readonly repository: MasterNodeRepositoryContract,
    private readonly consensusService: ConsensusServiceContract,
    private readonly clusterService: ClusterServiceContract,
    private readonly selfMasterNodeId: MasterNodeId
  ) {}

  async listMasterNodes(): Promise<MasterNode[]> {
    return this.repository.listAll();
  }

  async getMasterNodeById(id: MasterNodeId): Promise<MasterNode> {
    const masterNode = await this.repository.findById(id);

    if (!masterNode) {
      throw new GenericNotFoundError('Master node not found');
    }

    return masterNode;
  }

  async registerMasterNode(input: RegisterMasterNodeInput): Promise<MasterNode> {
    const currentMasterNode = await this.repository.findById(input.id);

    if (currentMasterNode && currentMasterNode.certificateFingerprint !== input.certificateFingerprint) {
      throw new GenericConflictError('Master node certificate does not match the registered certificate');
    }

    const repositoryInput: ApplyMasterNodeRegistrationRepositoryInput = {
      id: input.id,

      certificateFingerprint: input.certificateFingerprint,
      sessionId: input.sessionId,
      state: input.state,
      mode: input.mode,

      endpoint: input.endpoint,

      lastContactAt: new Date()
    };

    return this.repository.applyRegistration(repositoryInput);
  }

  async setMasterNodeMode(id: MasterNodeId, mode: MasterNodeMode): Promise<MasterNode> {
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

    const transitioned = await this.repository.transitionMode({
      id,
      from: masterNode.mode,
      to: mode,
      expectedRevision: masterNode.revision
    });

    if (!transitioned) {
      const currentMasterNode = await this.getMasterNodeById(id);

      if (currentMasterNode.mode === mode) {
        return currentMasterNode;
      }

      throw new GenericAbortedError('Master node mode transition was aborted by a concurrent change');
    }

    await this.clusterService.advanceMembershipRevision();

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
