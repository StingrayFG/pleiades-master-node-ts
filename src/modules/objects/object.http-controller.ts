import type { FastifyReply, FastifyRequest } from 'fastify';

import type { GetObjectHttpRoute, HeadObjectHttpRoute, PutObjectHttpRoute } from './object.http-contracts';
import type { ObjectServiceContract } from './object.service';

/* contract */

type ObjectHttpControllerContract = {
  getObject(req: FastifyRequest<GetObjectHttpRoute>, reply: FastifyReply<GetObjectHttpRoute>): Promise<void>;
  headObject(req: FastifyRequest<HeadObjectHttpRoute>, reply: FastifyReply<HeadObjectHttpRoute>): Promise<void>;
  putObject(req: FastifyRequest<PutObjectHttpRoute>, reply: FastifyReply<PutObjectHttpRoute>): Promise<void>;
};

/* controller */

class ObjectController implements ObjectHttpControllerContract {
  constructor(private readonly service: ObjectServiceContract) {}

  async getObject(req: FastifyRequest<GetObjectHttpRoute>, reply: FastifyReply<GetObjectHttpRoute>): Promise<void> {
    const userId = req.auth.userId;
    const bucketName = req.params.bucketName;
    const objectKey = req.params['*'];

    const objectRead = await this.service.getObject({
      userId,

      bucketName,
      objectKey
    });

    reply.header('content-length', objectRead.objectVersion.totalSizeBytes.toString());
    reply.header('content-type', objectRead.objectVersion.contentType);
    reply.header('x-object-version', String(objectRead.objectVersion.version));

    if (objectRead.objectVersion.committedAt) {
      reply.header('last-modified', objectRead.objectVersion.committedAt.toUTCString());
    }

    await reply.code(200).send(objectRead.data);
  }

  async headObject(req: FastifyRequest<HeadObjectHttpRoute>, reply: FastifyReply<HeadObjectHttpRoute>): Promise<void> {
    const userId = req.auth.userId;
    const bucketName = req.params.bucketName;
    const objectKey = req.params['*'];

    const objectVersion = await this.service.getObjectMetadata({
      userId,

      bucketName,
      objectKey
    });

    reply.header('content-length', objectVersion.totalSizeBytes.toString());
    reply.header('content-type', objectVersion.contentType);
    reply.header('x-object-version', String(objectVersion.version));

    if (objectVersion.committedAt) {
      reply.header('last-modified', objectVersion.committedAt.toUTCString());
    }

    await reply.code(200).send(undefined);
  }

  async putObject(req: FastifyRequest<PutObjectHttpRoute>, reply: FastifyReply<PutObjectHttpRoute>): Promise<void> {
    const userId = req.auth.userId;
    const bucketName = req.params.bucketName;
    const objectKey = req.params['*'];
    const totalSizeBytes = req.headers['content-length'];
    const contentType = req.headers['content-type'];
    const data = req.raw;

    const objectCreation = await this.service.createObject({
      userId,

      bucketName,
      objectKey,

      totalSizeBytes,
      contentType,

      data
    });

    reply.header('x-object-version', String(objectCreation.objectVersion.version));

    await reply.code(204).send(undefined);
  }
}

/* exports */

export { ObjectController };
export type { ObjectHttpControllerContract };
