import app from './app';

import env from '@/env';

const port = Number(env.PORT);

app.listen(
  {
    port,
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
