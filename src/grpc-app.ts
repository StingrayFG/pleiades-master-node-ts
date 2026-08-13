import { Server, ServerCredentials } from '@grpc/grpc-js';

import app from '@/app';
import prisma from '@/database/prisma/prisma.client';
import env from '@/env';
import { createDataNodeModule } from '@/modules/data-nodes/data-node.module';
import { createDataNodeGrpcRoutes } from '@/modules/data-nodes/data-node.grpc-routes';
import type { ToGrpcServerErrorOptions } from '@/transports/grpc/handlers/error-handler';
import { registerGrpcServiceWithErrorHandling } from '@/transports/grpc/server/grpc-service';
import { DataNodeMembershipService } from '@/gen/proto/membership/v1/membership';

const grpcHost = '0.0.0.0';
const grpcPort = Number(env.GRPC_PORT);
const grpcAddress = `${grpcHost}:${grpcPort}`;

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

const startGrpcServer = async (): Promise<Server> => {
  const dataNodeModule = createDataNodeModule({
    prisma
  });

  const dataNodeGrpcRoutes = createDataNodeGrpcRoutes({
    controller: dataNodeModule.controller
  });

  const grpcServer = new Server();

  const grpcErrorHandlerOptions: ToGrpcServerErrorOptions = {
    onInternalError: (error) => {
      app.log.error(error);
    }
  };

  registerGrpcServiceWithErrorHandling(
    grpcServer,
    DataNodeMembershipService,
    dataNodeGrpcRoutes.dataNodeMembershipService,
    grpcErrorHandlerOptions
  );

  await new Promise<void>((resolve, reject) => {
    grpcServer.bindAsync(`${grpcAddress}`, ServerCredentials.createInsecure(), (err, port) => {
      if (err) {
        reject(err);
        return;
      }

      app.log.info(`node grpc running on ${grpcHost}:${port}`);
      resolve();
    });
  });

  return grpcServer;
};

const startGrpcApp = async (): Promise<void> => {
  try {
    const grpcServer = await startGrpcServer();

    app.addHook('onClose', async () => {
      await stopGrpcServer(grpcServer);
    });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

export { startGrpcApp };
