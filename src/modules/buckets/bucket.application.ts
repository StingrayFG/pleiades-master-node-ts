import { z } from 'zod';

import { bucketSchema } from './bucket.domain';

export const ensureBucketExistsResultSchema = z.object({
  bucket: bucketSchema,
  created: z.boolean()
});
export type EnsureBucketExistsResult = z.infer<typeof ensureBucketExistsResultSchema>;
