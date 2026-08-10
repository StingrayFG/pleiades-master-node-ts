import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import type { BucketControllerContract } from './bucket.http-controller';
import {
  getBucketHttpSchema,
  putBucketHttpSchema,
  type GetBucketHttpRoute,
  type PutBucketHttpRoute
} from './bucket.http-contracts';

/**/

type BucketRoutesDependencies = {
  controller: BucketControllerContract;
};

/**/

const createBucketRoutes = ({ controller }: BucketRoutesDependencies): FastifyPluginAsync => {
  return async (app) => {
    app.addHook('onRequest', app.JWTAuthMW);

    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.get<GetBucketHttpRoute>(
      '/:bucketName',
      {
        schema: getBucketHttpSchema
      },
      (req, reply) => controller.getBucket(req, reply)
    );

    typedApp.put<PutBucketHttpRoute>(
      '/:bucketName',
      {
        schema: putBucketHttpSchema
      },
      (req, reply) => controller.putBucket(req, reply)
    );
  };
};

export { createBucketRoutes };
