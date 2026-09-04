// external
import { Server } from '@grpc/grpc-js';

// application
import app, { compositionRoot } from '@/app';

// generated grpc contracts
import { DataNodeMembershipService } from '@/gen/proto/membership/v1/membership';

// grpc infrastructure
import type { ToGrpcServerErrorOptions } from '@/transports/grpc/handlers/error-handler';
import { registerGrpcServiceWithErrorHandling } from '@/transports/grpc/server/grpc-service';

// module grpc surfaces
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
  controller: compositionRoot.dataNodeModule.controller
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

  grpcServer.bindAsync(address, compositionRoot.grpcServerCredentials.get(), (err, boundPort) => {
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
