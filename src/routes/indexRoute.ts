import type { FastifyPluginCallback } from 'fastify';

const indexRoute: FastifyPluginCallback = (server, options, done) => {
  server.get('/', async (request, reply) => {
    return reply.code(200).send();
  });

  done();
};

export default indexRoute;
