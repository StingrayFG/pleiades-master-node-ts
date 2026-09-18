import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { RegisterMasterNodeInput } from '@/modules/master-nodes/master-node.application';
import type { MasterNodeServiceContract } from '@/modules/master-nodes/master-node.service';

import { BootstrapController } from './bootstrap.http-controller';
import { BootstrapService } from './bootstrap.service';

/* contract */

type BootstrapModuleDependencies = {
  consensusService: ConsensusServiceContract;
  masterNodeService: MasterNodeServiceContract;
  selfMasterNode: Omit<RegisterMasterNodeInput, 'state' | 'mode'>;
};

type BootstrapModule = {
  service: BootstrapService;
  controller: BootstrapController;
};

/* module */

const createBootstrapModule = ({
  consensusService,
  masterNodeService,
  selfMasterNode
}: BootstrapModuleDependencies): BootstrapModule => {
  const service = new BootstrapService(consensusService, masterNodeService, selfMasterNode);

  const controller = new BootstrapController(service);

  return {
    service,
    controller
  };
};

/* exports */

export { createBootstrapModule };
export type { BootstrapModule, BootstrapModuleDependencies };
