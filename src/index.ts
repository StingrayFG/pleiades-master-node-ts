import type { Server } from '@grpc/grpc-js';

import app from './app';

import env from '@/env';
import { startRegisterGrpcServer, stopRegisterGrpcServer } from '@/grpc/registerServer';

const port = Number(env.PORT);
const grpcPort = Number(env.GRPC_PORT);

const start = async (): Promise<void> => {
  let grpcServer: Server | undefined;

  try {
    grpcServer = await startRegisterGrpcServer({
      host: '0.0.0.0',
      port: grpcPort
    });

    app.addHook('onClose', async () => {
      if (grpcServer) {
        await stopRegisterGrpcServer(grpcServer);
      }
    });

    const address = await app.listen({
      port,
      host: '0.0.0.0'
    });

    app.log.info(`http running on ${address}`);
    app.log.info(`node grpc running on 0.0.0.0:${grpcPort}`);
  } catch (err) {
    app.log.error(err);

    if (grpcServer) {
      await stopRegisterGrpcServer(grpcServer).catch(() => undefined);
    }

    process.exit(1);
  }
};

void start();
