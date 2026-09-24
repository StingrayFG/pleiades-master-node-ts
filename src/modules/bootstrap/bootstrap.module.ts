import type { ClusterServiceContract } from '@/modules/cluster/cluster.service';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { RegisterMasterNodeInput } from '@/modules/master-nodes/master-node.application';
import type { MasterNodeGrpcClientContract } from '@/modules/master-nodes/master-node.grpc-client';
import type { MasterNodeServiceContract } from '@/modules/master-nodes/master-node.service';

import { BootstrapController } from './bootstrap.http-controller';
import { BootstrapService } from './bootstrap.service';

/* contract */

type BootstrapModuleDependencies = {
  clusterService: ClusterServiceContract;
  consensusService: ConsensusServiceContract;
  masterNodeService: MasterNodeServiceContract;
  masterNodeGrpcClient: MasterNodeGrpcClientContract;
  selfMasterNode: Omit<RegisterMasterNodeInput, 'state' | 'mode'>;
};

type BootstrapModule = {
  service: BootstrapService;
  controller: BootstrapController;
};

/* module */

const createBootstrapModule = ({
  clusterService,
  consensusService,
  masterNodeService,
  masterNodeGrpcClient,
  selfMasterNode
}: BootstrapModuleDependencies): BootstrapModule => {
  const service = new BootstrapService(
    clusterService,
    consensusService,
    masterNodeService,
    masterNodeGrpcClient,
    selfMasterNode
  );

  const controller = new BootstrapController(service);

  return {
    service,
    controller
  };
};

/* exports */

export { createBootstrapModule };
export type { BootstrapModule, BootstrapModuleDependencies };
