import Fastify from 'fastify';

import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';

import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';

import fastifyRedis from '@fastify/redis';

//
//
//

import env from '@/env';
import prisma from '@/database/prisma/prisma.client';
import redis from '@/instances/redis';

import bucketRoutes from '@/modules/buckets/bucket.routes';
import indexRoute from '@/routes/indexRoute';
import authMiddlewares from '@/middlewares/authMiddlewares';

import errorHandlerPlugin from '@/transports/http/plugins/error-handler.plugin';

//
//
//

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info'
  }
});

app.register(cors, {
  origin: [env.CLIENT_URL],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
});

app.register(fastifyJwt, {
  secret: env.JWT_TOKEN_SECRET
});

app.register(fastifyRedis, { client: redis });

app.addHook('onClose', async () => {
  await prisma.$disconnect();
});

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

//
//
//

app.register(errorHandlerPlugin);

app.register(authMiddlewares);

app.register(bucketRoutes);
app.register(indexRoute);

//
//
//

export default app;
