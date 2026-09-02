import { z } from 'zod';

import { bucketIdSchema } from '@/modules/buckets/bucket.domain';

/* field schemas */

export const OBJECT_VERSION_STATES = ['pending', 'committed', 'deleting'] as const;

export const objectIdSchema = z.uuid();
export const objectKeySchema = z.string().min(1);
export const objectCurrentVersionSchema = z.number().int().positive().nullable();
export const objectLastAllocatedVersionSchema = z.number().int().nonnegative();

export const objectVersionNumberSchema = z.number().int().positive();
export const objectVersionStateSchema = z.enum(OBJECT_VERSION_STATES);
export const objectVersionTotalSizeBytesSchema = z.bigint().nonnegative();
export const objectVersionContentTypeSchema = z.string().min(1);

/* object schemas */

export const objectSchema = z.object({
  id: objectIdSchema,
  key: objectKeySchema,
  bucketId: bucketIdSchema,

  currentVersion: objectCurrentVersionSchema,
  lastAllocatedVersion: objectLastAllocatedVersionSchema,

  createdAt: z.date(),
  updatedAt: z.date()
});

export const objectVersionSchema = z.object({
  objectId: objectIdSchema,
  version: objectVersionNumberSchema,

  state: objectVersionStateSchema,

  totalSizeBytes: objectVersionTotalSizeBytesSchema,
  contentType: objectVersionContentTypeSchema,

  createdAt: z.date(),
  committedAt: z.date().nullable(),
  updatedAt: z.date()
});

/* types */

export type ObjectId = z.infer<typeof objectIdSchema>;
export type ObjectKey = z.infer<typeof objectKeySchema>;
export type ObjectCurrentVersion = z.infer<typeof objectCurrentVersionSchema>;
export type ObjectLastAllocatedVersion = z.infer<typeof objectLastAllocatedVersionSchema>;

export type ObjectVersionNumber = z.infer<typeof objectVersionNumberSchema>;
export type ObjectVersionState = z.infer<typeof objectVersionStateSchema>;
export type ObjectVersionTotalSizeBytes = z.infer<typeof objectVersionTotalSizeBytesSchema>;
export type ObjectVersionContentType = z.infer<typeof objectVersionContentTypeSchema>;

export type Object = z.infer<typeof objectSchema>;
export type ObjectVersion = z.infer<typeof objectVersionSchema>;
