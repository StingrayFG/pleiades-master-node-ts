import type { FastifyReply, FastifyRequest } from 'fastify';

import type {
  DeleteBucketHttpRoute,
  GetBucketHttpRoute,
  ListBucketsHttpRoute,
  PutBucketHttpRoute
} from './bucket.http-contracts';
import { mapDomainBucketToHttpBucketResponse, mapDomainBucketsToHttpBucketsResponse } from './bucket.mappers';
import type { BucketServiceContract } from './bucket.service';

/**/

type BucketHttpControllerContract = {
  listBuckets(reply: FastifyReply<ListBucketsHttpRoute>): Promise<void>;
  getBucket(req: FastifyRequest<GetBucketHttpRoute>, reply: FastifyReply<GetBucketHttpRoute>): Promise<void>;
  putBucket(req: FastifyRequest<PutBucketHttpRoute>, reply: FastifyReply<PutBucketHttpRoute>): Promise<void>;
  deleteBucket(req: FastifyRequest<DeleteBucketHttpRoute>, reply: FastifyReply<DeleteBucketHttpRoute>): Promise<void>;
};

/**/

class BucketController implements BucketHttpControllerContract {
  constructor(private readonly service: BucketServiceContract) {}

  async listBuckets(reply: FastifyReply<ListBucketsHttpRoute>): Promise<void> {
    const buckets = await this.service.listBuckets();

    const res = mapDomainBucketsToHttpBucketsResponse(buckets);

    reply.code(200).send(res);
  }

  async getBucket(req: FastifyRequest<GetBucketHttpRoute>, reply: FastifyReply<GetBucketHttpRoute>): Promise<void> {
    const { bucketName } = req.params;

    const bucket = await this.service.getBucketByName(bucketName);

    const res = mapDomainBucketToHttpBucketResponse(bucket);

    reply.code(200).send(res);
  }

  async putBucket(req: FastifyRequest<PutBucketHttpRoute>, reply: FastifyReply<PutBucketHttpRoute>): Promise<void> {
    const { bucketName } = req.params;

    const result = await this.service.ensureBucketExists(bucketName);

    const res = mapDomainBucketToHttpBucketResponse(result.bucket);

    if (result.status === 'created') {
      reply.code(201).send(res);
      return;
    }

    reply.code(200).send(res);
  }

  async deleteBucket(
    req: FastifyRequest<DeleteBucketHttpRoute>,
    reply: FastifyReply<DeleteBucketHttpRoute>
  ): Promise<void> {
    const { bucketName } = req.params;

    const bucket = await this.service.deleteBucket(bucketName);

    const res = mapDomainBucketToHttpBucketResponse(bucket);

    reply.code(200).send(res);
  }
}

export { BucketController };

export type { BucketHttpControllerContract };
