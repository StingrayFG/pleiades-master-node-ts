import { z } from 'zod';

import { bucketSchema } from './bucket.domain';

/* schemas */

export const ensureBucketExistsResultSchema = z.object({
  bucket: bucketSchema,
  status: z.enum(['created', 'existing'])
});

/* types */

export type EnsureBucketExistsResult = z.infer<typeof ensureBucketExistsResultSchema>;
