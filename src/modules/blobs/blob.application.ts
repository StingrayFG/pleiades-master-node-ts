import { z } from 'zod';

import { dataNodeEndpointSchema } from '@/modules/data-nodes/data-node.domain';

import { blobIdSchema, blobMetadataWithBytesSchema } from './blob.domain';

/* schemas */

export const dataNodeBlobInputSchema = z.object({
  blobId: blobIdSchema,

  dataNodeEndpoint: dataNodeEndpointSchema
});

export const dataNodeBlobWithBytesInputSchema = z.object({
  blob: blobMetadataWithBytesSchema,

  dataNodeEndpoint: dataNodeEndpointSchema
});

export type DataNodeBlobInput = z.infer<typeof dataNodeBlobInputSchema>;
export type DataNodeBlobWithBytesInput = z.infer<typeof dataNodeBlobWithBytesInputSchema>;
