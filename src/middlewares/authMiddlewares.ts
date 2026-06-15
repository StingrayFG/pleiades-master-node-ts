import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

const authMiddlewares: FastifyPluginAsync = async (fastify, options) => {
  fastify.decorate('JWTAuthMW', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send();
    }
  });
};

export default fp(authMiddlewares);
