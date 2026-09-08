import type { FastifyReply, FastifyRequest } from 'fastify';

import type {
  DeleteBucketHttpRoute,
  GetBucketHttpRoute,
  ListBucketsHttpRoute,
  PutBucketHttpRoute
} from './bucket.http-contracts';
import { mapDomainBucketToHttpBucketResponse, mapDomainBucketsToHttpBucketsResponse } from './bucket.mappers';
import type { BucketServiceContract } from './bucket.service';

/* contract */

type BucketHttpControllerContract = {
  listBuckets(req: FastifyRequest<ListBucketsHttpRoute>, reply: FastifyReply<ListBucketsHttpRoute>): Promise<void>;
  getBucket(req: FastifyRequest<GetBucketHttpRoute>, reply: FastifyReply<GetBucketHttpRoute>): Promise<void>;
  putBucket(req: FastifyRequest<PutBucketHttpRoute>, reply: FastifyReply<PutBucketHttpRoute>): Promise<void>;
  deleteBucket(req: FastifyRequest<DeleteBucketHttpRoute>, reply: FastifyReply<DeleteBucketHttpRoute>): Promise<void>;
};

/* controller */

class BucketController implements BucketHttpControllerContract {
  constructor(private readonly service: BucketServiceContract) {}

  async listBuckets(
    req: FastifyRequest<ListBucketsHttpRoute>,
    reply: FastifyReply<ListBucketsHttpRoute>
  ): Promise<void> {
    const userId = req.auth.userId;

    const buckets = await this.service.listBuckets(userId);

    const res = mapDomainBucketsToHttpBucketsResponse(buckets);

    await reply.code(200).send(res);
  }

  async getBucket(req: FastifyRequest<GetBucketHttpRoute>, reply: FastifyReply<GetBucketHttpRoute>): Promise<void> {
    const userId = req.auth.userId;
    const bucketName = req.params.bucketName;

    const bucket = await this.service.getBucketByName(userId, bucketName);

    const res = mapDomainBucketToHttpBucketResponse(bucket);

    await reply.code(200).send(res);
  }

  async putBucket(req: FastifyRequest<PutBucketHttpRoute>, reply: FastifyReply<PutBucketHttpRoute>): Promise<void> {
    const userId = req.auth.userId;
    const bucketName = req.params.bucketName;

    const bucketResolution = await this.service.ensureBucketExists(userId, bucketName);

    const res = mapDomainBucketToHttpBucketResponse(bucketResolution.bucket);

    if (bucketResolution.status === 'created') {
      await reply.code(201).send(res);
      return;
    }

    await reply.code(200).send(res);
  }

  async deleteBucket(
    req: FastifyRequest<DeleteBucketHttpRoute>,
    reply: FastifyReply<DeleteBucketHttpRoute>
  ): Promise<void> {
    const userId = req.auth.userId;
    const bucketName = req.params.bucketName;

    const bucket = await this.service.deleteBucket(userId, bucketName);

    const res = mapDomainBucketToHttpBucketResponse(bucket);

    await reply.code(200).send(res);
  }
}

/* exports */

export { BucketController };
export type { BucketHttpControllerContract };
