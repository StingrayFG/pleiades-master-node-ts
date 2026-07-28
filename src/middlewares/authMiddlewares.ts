import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

import { UnauthorizedError } from '@/errors';

const authMiddlewares: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('JWTAuthMW', async (request) => {
    try {
      await request.jwtVerify();
    } catch {
      throw new UnauthorizedError('Invalid client token');
    }
  });
};

export default fp(authMiddlewares);
