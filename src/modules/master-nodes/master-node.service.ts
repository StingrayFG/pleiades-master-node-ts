import { GenericConflictError, GenericNotFoundError } from '@/errors/application.errors';

import type { ApplyMasterNodeRegistrationRepositoryInput, RegisterMasterNodeInput } from './master-node.application';
import type { MasterNode, MasterNodeId } from './master-node.domain';
import type { MasterNodeRepositoryContract } from './master-node.repository';

/* contract */

type MasterNodeServiceContract = {
  listMasterNodes(): Promise<MasterNode[]>;
  getMasterNodeById(id: MasterNodeId): Promise<MasterNode>;
  registerMasterNode(input: RegisterMasterNodeInput): Promise<MasterNode>;
};

/* service */

class MasterNodeService implements MasterNodeServiceContract {
  constructor(private readonly repository: MasterNodeRepositoryContract) {}

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
}

/* exports */

export { MasterNodeService };
export type { MasterNodeServiceContract };
