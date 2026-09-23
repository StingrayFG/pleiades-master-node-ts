import type { MasterServer } from '@/gen/proto/master/v1/master';

import type { MasterNodeGrpcControllerContract } from './master-node.grpc-controller';

/* contract */

type MasterNodeGrpcRoutesDependencies = {
  controller: MasterNodeGrpcControllerContract;
};

type MasterNodeGrpcRoutes = {
  masterService: MasterServer;
};

/* routes */

const createMasterNodeGrpcRoutes = ({ controller }: MasterNodeGrpcRoutesDependencies): MasterNodeGrpcRoutes => {
  return {
    masterService: {
      fetchTaskEntries: (call, callback) => controller.fetchTaskEntries(call, callback),
      fetchTaskPayload: (call, callback) => controller.fetchTaskPayload(call, callback)
    }
  };
};

/* exports */

export { createMasterNodeGrpcRoutes };
export type { MasterNodeGrpcRoutes, MasterNodeGrpcRoutesDependencies };
