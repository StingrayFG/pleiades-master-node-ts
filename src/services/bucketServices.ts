import type { Bucket } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { ConflictError } from '@/errors';
import prisma from '@/instances/prisma';

const bucketServices = {
  getBucketByName: async (bucketName: string): Promise<Bucket | null> => {
    const bucket = await prisma.bucket.findUnique({
      where: {
        name: bucketName
      }
    });

    return bucket;
  },
  createBucket: async (bucketName: string): Promise<Bucket> => {
    try {
      const bucket = await prisma.bucket.create({
        data: {
          name: bucketName
        }
      });

      return bucket;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictError('Bucket already exists');
      }

      throw err;
    }
  }
};

export default bucketServices;
