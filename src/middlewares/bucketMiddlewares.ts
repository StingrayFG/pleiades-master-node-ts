import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

import { BadRequestError } from '@/errors';

const bucketMiddlewares: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('ValidateBucketNameMW', async (request) => {
    if (!request.params || typeof request.params !== 'object') {
      throw new BadRequestError('Invalid object path');
    }

    const bucketName = (request.params as Record<string, unknown>).bucketName;
    if (typeof bucketName !== 'string' || bucketName.length === 0) {
      throw new BadRequestError('Invalid object path');
    }

    // 3-63 chars, lowercase letter/digit first and last, lowercase letter/digit/dot/dash in between
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucketName)) {
      throw new BadRequestError('Bucket name is invalid');
    }
  });
};

export default fp(bucketMiddlewares);
