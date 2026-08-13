import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import {
  deleteBucketHttpSchema,
  getBucketHttpSchema,
  listBucketsHttpSchema,
  putBucketHttpSchema,
  type DeleteBucketHttpRoute,
  type GetBucketHttpRoute,
  type ListBucketsHttpRoute,
  type PutBucketHttpRoute
} from './bucket.http-contracts';
import type { BucketHttpControllerContract } from './bucket.http-controller';

/**/

type BucketHttpRoutesDependencies = {
  controller: BucketHttpControllerContract;
};

/**/

const createBucketHttpRoutes = ({ controller }: BucketHttpRoutesDependencies): FastifyPluginAsync => {
  return async (app) => {
    app.addHook('onRequest', app.JWTAuthMW);

    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.get<ListBucketsHttpRoute>(
      '/',
      {
        schema: listBucketsHttpSchema
      },
      (_, reply) => controller.listBuckets(reply)
    );

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

    typedApp.delete<DeleteBucketHttpRoute>(
      '/:bucketName',
      {
        schema: deleteBucketHttpSchema
      },
      (req, reply) => controller.deleteBucket(req, reply)
    );
  };
};

export { createBucketHttpRoutes };
