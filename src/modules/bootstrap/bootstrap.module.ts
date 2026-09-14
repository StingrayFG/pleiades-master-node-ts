import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { MasterNodeId } from '@/modules/master-nodes/master-node.domain';

import { BootstrapController } from './bootstrap.http-controller';
import { BootstrapService } from './bootstrap.service';

/* contract */

type BootstrapModuleDependencies = {
  consensusService: ConsensusServiceContract;
  selfMasterNodeId: MasterNodeId;
};

type BootstrapModule = {
  service: BootstrapService;
  controller: BootstrapController;
};

/* module */

const createBootstrapModule = ({
  consensusService,
  selfMasterNodeId
}: BootstrapModuleDependencies): BootstrapModule => {
  const service = new BootstrapService(consensusService, selfMasterNodeId);

  const controller = new BootstrapController(service);

  return {
    service,
    controller
  };
};

/* exports */

export { createBootstrapModule };
export type { BootstrapModule, BootstrapModuleDependencies };
