import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

import { GenericUnauthorizedError } from '@/errors/application.errors';

/**/

const adminJwtMiddleware: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('adminAuthMW', async (request) => {
    try {
      await request.adminJwtVerify();
    } catch {
      throw new GenericUnauthorizedError('Invalid admin token');
    }
  });
};

/**/

export default fp(adminJwtMiddleware);
