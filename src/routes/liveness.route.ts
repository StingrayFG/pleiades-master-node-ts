import type { FastifyPluginAsync } from 'fastify';

/* routes */

const livenessRoute: FastifyPluginAsync = async (app) => {
  app.get('/health/live', async (_req, reply) => {
    await reply.code(200).send({ status: 'ok' });
  });
};

/* exports */

export default livenessRoute;
