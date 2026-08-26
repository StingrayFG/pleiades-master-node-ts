import { z } from 'zod';

import { bucketSchema } from './bucket.domain';

/**/

export const ensureBucketExistsResultSchema = z.object({
  bucket: bucketSchema,
  status: z.enum(['created', 'existing'])
});

/**/

export type EnsureBucketExistsResult = z.infer<typeof ensureBucketExistsResultSchema>;
