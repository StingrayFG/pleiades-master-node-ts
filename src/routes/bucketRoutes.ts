import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import z from 'zod';

import bucketServices from '@/services/bucketServices';

const bucketRoutes: FastifyPluginAsync = async (server) => {
  const typedServer = server.withTypeProvider<ZodTypeProvider>();

  typedServer.put(
    '/buckets/:bucketName',
    {
      onRequest: [server.JWTAuthMW, server.ValidateBucketNameMW],
      schema: {
        params: z.object({
          bucketName: z.string().min(1)
        }),
        response: {
          201: z.object({
            id: z.number().int().nonnegative(),
            name: z.string(),
            state: z.enum(['active', 'deleting', 'disabled']),
            created_at: z.string().datetime(),
            updated_at: z.string().datetime()
          })
        }
      }
    },
    async (request, reply) => {
      const bucket = await bucketServices.createBucket(request.params.bucketName);

      return reply.code(201).send({
        id: bucket.id,
        name: bucket.name,
        state: bucket.state,
        created_at: bucket.created_at.toISOString(),
        updated_at: bucket.updated_at.toISOString()
      });
    }
  );
};

export default bucketRoutes;
