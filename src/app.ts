import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';

import prisma from '@/database/prisma/prisma.client';
import env from '@/env';
import authMiddlewares from '@/middlewares/authMiddlewares';
import indexRoute from '@/routes/indexRoute';
import errorHandlerPlugin from '@/transports/http/plugins/error-handler.plugin';

import { createBlobModule } from '@/modules/blobs/blob.module';
import { createBucketHttpRoutes } from '@/modules/buckets/bucket.http-routes';
import { createBucketModule } from '@/modules/buckets/bucket.module';
import { createDataNodeModule } from '@/modules/data-nodes/data-node.module';
import { createObjectVersionPartModule } from '@/modules/object-version-parts/object-version-part.module';
import { createObjectHttpRoutes } from '@/modules/objects/object.http-routes';
import { createObjectModule } from '@/modules/objects/object.module';

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

/* modules */

const bucketModule = createBucketModule({ prisma });

const dataNodeModule = createDataNodeModule({ prisma });

const blobModule = createBlobModule();

const objectVersionPartModule = createObjectVersionPartModule({
  prisma,
  dataNodeService: dataNodeModule.service,
  blobService: blobModule.service
});

const objectModule = createObjectModule({
  prisma,
  bucketService: bucketModule.service,
  objectVersionPartService: objectVersionPartModule.service
});

/* routes */

app.register(indexRoute);

app.register(
  createBucketHttpRoutes({
    controller: bucketModule.controller
  }),
  {
    prefix: '/buckets'
  }
);

app.register(
  createObjectHttpRoutes({
    controller: objectModule.controller
  }),
  {
    prefix: '/buckets'
  }
);

/* lifecycle */

app.addHook('onClose', async () => {
  dataNodeModule.grpcClient.close();
  blobModule.grpcClient.close();

  await prisma.$disconnect();
});

/* exports */

export { dataNodeModule };
export default app;
