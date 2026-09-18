import app, { compositionRoot } from '@/app';
import env from '@/env';
import { startGrpcApp } from '@/grpc-app';

const main = async (): Promise<void> => {
  await compositionRoot.bootstrapModule.service.bootstrapAsLeader();

  startGrpcApp(
    {
      port: env.LISTEN_GRPC_PORT,
      host: env.LISTEN_HOST
    },
    (err, address) => {
      if (err) {
        app.log.error(err);
        process.exit(1);
      }

      app.log.info(`node grpc running on ${address}`);
    }
  );

  app.listen(
    {
      port: env.LISTEN_PORT,
      host: env.LISTEN_HOST
    },
    (err, address) => {
      if (err) {
        app.log.error(err);
        process.exit(1);
      }

      app.log.info(`app running on ${address}`);
    }
  );
};

void main();
