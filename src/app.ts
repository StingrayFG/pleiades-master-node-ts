import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';

import { createCompositionRoot } from '@/composition-root';
import env from '@/env';
import authMiddlewares from '@/middlewares/authMiddlewares';
import indexRoute from '@/routes/indexRoute';
import errorHandlerPlugin from '@/transports/http/plugins/error-handler.plugin';

import { createBucketHttpRoutes } from '@/modules/buckets/bucket.http-routes';
import { createObjectHttpRoutes } from '@/modules/objects/object.http-routes';

/* app */

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info'
  }
});

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

/* plugins */

app.register(cors, {
  origin: '*',
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
});

app.register(fastifyJwt, {
  secret: env.JWT_TOKEN_SECRET
});

app.register(authMiddlewares);
app.register(errorHandlerPlugin);

/* composition */

const compositionRoot = createCompositionRoot({
  logger: app.log
});

/* routes */

app.register(indexRoute);

app.register(
  createBucketHttpRoutes({
    controller: compositionRoot.bucketModule.controller
  }),
  {
    prefix: '/buckets'
  }
);

app.register(
  createObjectHttpRoutes({
    controller: compositionRoot.objectModule.controller
  }),
  {
    prefix: '/buckets'
  }
);

/* background workers */

compositionRoot.backgroundModule.start();

/* lifecycle */

app.addHook('onClose', async () => {
  await compositionRoot.backgroundModule.stop();
  await compositionRoot.close();
});

/* exports */

export { compositionRoot };
export default app;
