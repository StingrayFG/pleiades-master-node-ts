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
      fetchMasterInfo: (call, callback) => controller.fetchMasterInfo(call, callback),
      registerMasterNode: (call, callback) => controller.registerMasterNode(call, callback),
      fetchTaskEntries: (call, callback) => controller.fetchTaskEntries(call, callback),
      fetchTaskPayload: (call, callback) => controller.fetchTaskPayload(call, callback),
      forwardTask: (call, callback) => controller.forwardTask(call, callback),
      requestVote: (call, callback) => controller.requestVote(call, callback),
      recordLeaderHeartbeat: (call, callback) => controller.recordLeaderHeartbeat(call, callback)
    }
  };
};

/* exports */

export { createMasterNodeGrpcRoutes };
export type { MasterNodeGrpcRoutes, MasterNodeGrpcRoutesDependencies };
