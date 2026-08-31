import { z } from 'zod';

import { dataNodeEndpointSchema } from '@/modules/data-nodes/data-node.domain';

import { blobIdSchema, blobMetadataWithBytesSchema } from './blob.domain';

/* service schemas */

export const getBlobMetadataInputSchema = z.object({
  blobId: blobIdSchema,
  dataNodeEndpoint: dataNodeEndpointSchema
});

export const getBlobInputSchema = z.object({
  blobId: blobIdSchema,
  dataNodeEndpoint: dataNodeEndpointSchema
});

export const verifyBlobInputSchema = z.object({
  blobId: blobIdSchema,
  dataNodeEndpoint: dataNodeEndpointSchema
});

export const ensureBlobExistsInputSchema = z.object({
  blob: blobMetadataWithBytesSchema,
  dataNodeEndpoint: dataNodeEndpointSchema
});

export const deleteBlobInputSchema = z.object({
  blobId: blobIdSchema,
  dataNodeEndpoint: dataNodeEndpointSchema
});

/* client schemas */

export const headBlobClientInputSchema = z.object({
  blobId: blobIdSchema,
  dataNodeEndpoint: dataNodeEndpointSchema
});

export const getBlobClientInputSchema = z.object({
  blobId: blobIdSchema,
  dataNodeEndpoint: dataNodeEndpointSchema
});

export const verifyBlobClientInputSchema = z.object({
  blobId: blobIdSchema,
  dataNodeEndpoint: dataNodeEndpointSchema
});

export const putBlobClientInputSchema = z.object({
  blob: blobMetadataWithBytesSchema,
  dataNodeEndpoint: dataNodeEndpointSchema
});

export const deleteBlobClientInputSchema = z.object({
  blobId: blobIdSchema,
  dataNodeEndpoint: dataNodeEndpointSchema
});

/* types */

export type GetBlobMetadataInput = z.infer<typeof getBlobMetadataInputSchema>;
export type GetBlobInput = z.infer<typeof getBlobInputSchema>;
export type VerifyBlobInput = z.infer<typeof verifyBlobInputSchema>;
export type EnsureBlobExistsInput = z.infer<typeof ensureBlobExistsInputSchema>;
export type DeleteBlobInput = z.infer<typeof deleteBlobInputSchema>;

export type HeadBlobClientInput = z.infer<typeof headBlobClientInputSchema>;
export type GetBlobClientInput = z.infer<typeof getBlobClientInputSchema>;
export type VerifyBlobClientInput = z.infer<typeof verifyBlobClientInputSchema>;
export type PutBlobClientInput = z.infer<typeof putBlobClientInputSchema>;
export type DeleteBlobClientInput = z.infer<typeof deleteBlobClientInputSchema>;
