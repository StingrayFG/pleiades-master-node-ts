import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

import { GenericUnauthorizedError } from '@/errors/application.errors';

/**/

const jwtMiddleware: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('JWTAuthMW', async (request) => {
    try {
      await request.jwtVerify();

      request.auth = {
        userId: request.user.userId,
        authType: 'jwt'
      };
    } catch {
      throw new GenericUnauthorizedError('Invalid client token');
    }
  });
};

/**/

export default fp(jwtMiddleware);
