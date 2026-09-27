import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import {
  getMasterNodeHttpSchema,
  listMasterNodesHttpSchema,
  setMasterNodeModeHttpSchema,
  type GetMasterNodeHttpRoute,
  type ListMasterNodesHttpRoute,
  type SetMasterNodeModeHttpRoute
} from './master-node.http-contracts';
import type { MasterNodeHttpControllerContract } from './master-node.http-controller';

/* contract */

type MasterNodeHttpRoutesDependencies = {
  controller: MasterNodeHttpControllerContract;
};

/* routes */

const createMasterNodeHttpRoutes = ({ controller }: MasterNodeHttpRoutesDependencies): FastifyPluginAsync => {
  return async (app) => {
    app.addHook('onRequest', app.adminAuthMW);

    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.get<ListMasterNodesHttpRoute>(
      '/',
      {
        schema: listMasterNodesHttpSchema
      },
      (req, reply) => controller.listMasterNodes(req, reply)
    );

    typedApp.get<GetMasterNodeHttpRoute>(
      '/:masterNodeId',
      {
        schema: getMasterNodeHttpSchema
      },
      (req, reply) => controller.getMasterNode(req, reply)
    );

    typedApp.put<SetMasterNodeModeHttpRoute>(
      '/:masterNodeId/mode',
      {
        schema: setMasterNodeModeHttpSchema
      },
      (req, reply) => controller.setMasterNodeMode(req, reply)
    );
  };
};

/* exports */

export { createMasterNodeHttpRoutes };
