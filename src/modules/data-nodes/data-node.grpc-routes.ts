import type { HeartbeatDataNodeServer } from '@/gen/proto/heartbeat/v1/heartbeat';
import type { RegisterDataNodeServer } from '@/gen/proto/register/v1/register';

import type { DataNodeGrpcControllerContract } from './data-node.grpc-controller';

/**/

type DataNodeGrpcRoutesDependencies = {
  controller: DataNodeGrpcControllerContract;
};

type DataNodeGrpcRoutes = {
  registerDataNodeService: RegisterDataNodeServer;
  heartbeatDataNodeService: HeartbeatDataNodeServer;
};

/**/

const createDataNodeGrpcRoutes = ({ controller }: DataNodeGrpcRoutesDependencies): DataNodeGrpcRoutes => {
  return {
    registerDataNodeService: {
      registerDataNode: (call, callback) => controller.registerDataNode(call, callback)
    },
    heartbeatDataNodeService: {
      heartbeatDataNode: (call, callback) => controller.heartbeatDataNode(call, callback)
    }
  };
};

/**/

export { createDataNodeGrpcRoutes };

export type { DataNodeGrpcRoutes, DataNodeGrpcRoutesDependencies };
