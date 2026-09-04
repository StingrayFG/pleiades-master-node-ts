import { z } from 'zod';

import { blobIdSchema, dataNodeBlobStateSchema } from './blob.domain';

/* schemas */

export const internodeBlobErrorDetailsSchema = z.object({
  blobId: blobIdSchema,

  blobState: dataNodeBlobStateSchema.optional()
});

/* types */

export type InternodeBlobErrorDetails = z.infer<typeof internodeBlobErrorDetailsSchema>;
