import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import {
  bootstrapFollowerHttpSchema,
  bootstrapLeaderHttpSchema,
  type BootstrapFollowerHttpRoute,
  type BootstrapLeaderHttpRoute
} from './bootstrap.http-contracts';
import type { BootstrapHttpControllerContract } from './bootstrap.http-controller';

/* contract */

type BootstrapHttpRoutesDependencies = {
  controller: BootstrapHttpControllerContract;
};

/* routes */

const createBootstrapHttpRoutes = ({ controller }: BootstrapHttpRoutesDependencies): FastifyPluginAsync => {
  return async (app) => {
    app.addHook('onRequest', app.adminAuthMW);

    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.post<BootstrapLeaderHttpRoute>(
      '/leader',
      {
        schema: bootstrapLeaderHttpSchema
      },
      (req, reply) => controller.bootstrapLeader(req, reply)
    );

    typedApp.post<BootstrapFollowerHttpRoute>(
      '/follower',
      {
        schema: bootstrapFollowerHttpSchema
      },
      (req, reply) => controller.bootstrapFollower(req, reply)
    );
  };
};

/* exports */

export { createBootstrapHttpRoutes };
