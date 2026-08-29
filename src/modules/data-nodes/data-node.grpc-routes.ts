import type { DataNodeMembershipServer } from '@/gen/proto/membership/v1/membership';

import type { DataNodeGrpcControllerContract } from './data-node.grpc-controller';

/* contract */

type DataNodeGrpcRoutesDependencies = {
  controller: DataNodeGrpcControllerContract;
};

type DataNodeGrpcRoutes = {
  dataNodeMembershipService: DataNodeMembershipServer;
};

/* routes */

const createDataNodeGrpcRoutes = ({ controller }: DataNodeGrpcRoutesDependencies): DataNodeGrpcRoutes => {
  return {
    dataNodeMembershipService: {
      registerDataNode: (call, callback) => controller.registerDataNode(call, callback),
      recordDataNodeHeartbeat: (call, callback) => controller.recordDataNodeHeartbeat(call, callback)
    }
  };
};

/* exports */

export { createDataNodeGrpcRoutes };
export type { DataNodeGrpcRoutes, DataNodeGrpcRoutesDependencies };
