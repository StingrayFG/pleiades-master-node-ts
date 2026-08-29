import { Server, ServerCredentials } from '@grpc/grpc-js';

import app, { dataNodeModule } from '@/app';
import { DataNodeMembershipService } from '@/gen/proto/membership/v1/membership';
import type { ToGrpcServerErrorOptions } from '@/transports/grpc/handlers/error-handler';
import { registerGrpcServiceWithErrorHandling } from '@/transports/grpc/server/grpc-service';

import { createDataNodeGrpcRoutes } from '@/modules/data-nodes/data-node.grpc-routes';

/* contract */

type GrpcAppListenOptions = {
  port: number;
  host: string;
};

type GrpcAppListenCallback = (err: Error | null, address: string) => void;

/* configuration */

const grpcErrorHandlerOptions: ToGrpcServerErrorOptions = {
  onInternalError: (error) => {
    app.log.error(error);
  }
};

/* server */

const grpcServer = new Server();

const dataNodeGrpcRoutes = createDataNodeGrpcRoutes({
  controller: dataNodeModule.controller
});

registerGrpcServiceWithErrorHandling(
  grpcServer,
  DataNodeMembershipService,
  dataNodeGrpcRoutes.dataNodeMembershipService,
  grpcErrorHandlerOptions
);

/* lifecycle */

const startGrpcApp = (options: GrpcAppListenOptions, callback: GrpcAppListenCallback): void => {
  const address = `${options.host}:${options.port}`;

  grpcServer.bindAsync(address, ServerCredentials.createInsecure(), (err, boundPort) => {
    if (err) {
      grpcServer.forceShutdown();
      callback(err, address);
      return;
    }

    callback(null, `${options.host}:${boundPort}`);
  });
};

const stopGrpcServer = async (server: Server): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    server.tryShutdown((err) => {
      if (err) {
        reject(err);
        return;
      }

      resolve();
    });
  });
};

app.addHook('onClose', async () => {
  await stopGrpcServer(grpcServer);
});

/* exports */

export { startGrpcApp };
export type { GrpcAppListenCallback, GrpcAppListenOptions };
