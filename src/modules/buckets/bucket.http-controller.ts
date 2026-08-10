import type { FastifyReply, FastifyRequest } from 'fastify';

import type { GetBucketHttpRoute, PutBucketHttpRoute } from './bucket.http-contracts';
import type { BucketServiceContract } from './bucket.service';
import { mapDomainBucketToHttpBucketResponse } from './bucket.mappers';

/**/

type BucketControllerContract = {
  getBucket(req: FastifyRequest<GetBucketHttpRoute>, reply: FastifyReply<GetBucketHttpRoute>): Promise<void>;
  putBucket(req: FastifyRequest<PutBucketHttpRoute>, reply: FastifyReply<PutBucketHttpRoute>): Promise<void>;
};

/**/

class BucketController implements BucketControllerContract {
  constructor(private readonly service: BucketServiceContract) {}

  async getBucket(req: FastifyRequest<GetBucketHttpRoute>, reply: FastifyReply<GetBucketHttpRoute>): Promise<void> {
    const { bucketName } = req.params;

    const bucket = await this.service.getByName(bucketName);

    const res = mapDomainBucketToHttpBucketResponse(bucket);

    reply.code(200).send(res);
  }

  async putBucket(req: FastifyRequest<PutBucketHttpRoute>, reply: FastifyReply<PutBucketHttpRoute>): Promise<void> {
    const { bucketName } = req.params;

    const { bucket, created } = await this.service.ensureExists(bucketName);

    const res = mapDomainBucketToHttpBucketResponse(bucket);

    if (created) {
      reply.code(201).send(res);
      return;
    }

    reply.code(200).send(res);
  }
}

export { BucketController };

export type { BucketControllerContract };
