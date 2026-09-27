// external
import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';

// application infrastructure
import { serializeErrorForLog } from '@/common/serializers/error.serializer';
import { createCompositionRoot } from '@/composition-root';
import env from '@/env';

// http infrastructure
import jwtMiddleware from '@/plugins/jwt/jwt.middleware';
import adminJwtMiddleware from '@/plugins/admin-jwt/admin-jwt.middleware';
import livenessRoute from '@/routes/liveness.route';
import errorHandlerPlugin from '@/transports/http/plugins/error-handler.plugin';

// module routes
import { createBootstrapHttpRoutes } from '@/modules/bootstrap/bootstrap.http-routes';
import { createBucketHttpRoutes } from '@/modules/buckets/bucket.http-routes';
import { createMasterNodeHttpRoutes } from '@/modules/master-nodes/master-node.http-routes';
import { createObjectHttpRoutes } from '@/modules/objects/object.http-routes';
import { createUserHttpRoutes } from '@/modules/users/user.http-routes';

/* app */

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    serializers: {
      err: serializeErrorForLog
    }
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
  secret: env.USER_JWT_SECRET,
  sign: {
    expiresIn: env.USER_JWT_TTL
  }
});
app.register(fastifyJwt, {
  namespace: 'admin',
  secret: env.ADMIN_JWT_SECRET
});

app.register(jwtMiddleware);
app.register(adminJwtMiddleware);
app.register(errorHandlerPlugin);

/* composition */

const compositionRoot = createCompositionRoot({
  logger: app.log
});

/* routes */

app.register(livenessRoute);

app.register(createUserHttpRoutes({ controller: compositionRoot.userModule.controller }));

app.register(
  createBootstrapHttpRoutes({
    controller: compositionRoot.bootstrapModule.controller
  }),
  {
    prefix: '/internal/bootstrap'
  }
);

app.register(
  createMasterNodeHttpRoutes({
    controller: compositionRoot.masterNodeModule.controller
  }),
  {
    prefix: '/internal/master-nodes'
  }
);

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
