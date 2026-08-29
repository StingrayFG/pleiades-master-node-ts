import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import {
  getObjectHttpSchema,
  headObjectHttpSchema,
  putObjectHttpSchema,
  type GetObjectHttpRoute,
  type HeadObjectHttpRoute,
  type PutObjectHttpRoute
} from './object.http-contracts';
import type { ObjectHttpControllerContract } from './object.http-controller';

/* contract */

type ObjectHttpRoutesDependencies = {
  controller: ObjectHttpControllerContract;
};

/* routes */

const createObjectHttpRoutes = ({ controller }: ObjectHttpRoutesDependencies): FastifyPluginAsync => {
  return async (app) => {
    app.removeAllContentTypeParsers();
    app.addContentTypeParser('*', (_req, _payload, done) => {
      done(null);
    });

    app.addHook('onRequest', app.JWTAuthMW);

    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.get<GetObjectHttpRoute>(
      '/:bucketName/objects/*',
      {
        schema: getObjectHttpSchema,
        exposeHeadRoute: false
      },
      (req, reply) => controller.getObject(req, reply)
    );

    typedApp.head<HeadObjectHttpRoute>(
      '/:bucketName/objects/*',
      {
        schema: headObjectHttpSchema
      },
      (req, reply) => controller.headObject(req, reply)
    );

    typedApp.put<PutObjectHttpRoute>(
      '/:bucketName/objects/*',
      {
        schema: putObjectHttpSchema
      },
      (req, reply) => controller.putObject(req, reply)
    );
  };
};

/* exports */

export { createObjectHttpRoutes };
