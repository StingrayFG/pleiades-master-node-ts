import app, { compositionRoot } from '@/app';
import env from '@/env';
import { startGrpcApp } from '@/grpc-app';

const main = async (): Promise<void> => {
  await compositionRoot.bootstrapModule.service.bootstrapAsLeader();

  startGrpcApp(
    {
      port: env.GRPC_PORT,
      host: '0.0.0.0'
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
      port: env.PORT,
      host: '0.0.0.0'
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
