import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

import { GenericUnauthorizedError } from '@/errors/application.errors';

const authMiddlewares: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('JWTAuthMW', async (request) => {
    try {
      await request.jwtVerify();
    } catch {
      throw new GenericUnauthorizedError('Invalid client token');
    }
  });
};

export default fp(authMiddlewares);
