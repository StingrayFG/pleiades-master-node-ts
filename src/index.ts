import { startGrpcApp } from '@/grpc-app';

import app from '@/app';

import env from '@/env';

void startGrpcApp();

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
