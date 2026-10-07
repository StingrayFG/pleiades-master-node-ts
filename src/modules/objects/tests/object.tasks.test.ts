import { Buffer } from 'node:buffer';

import { describe, expect, test } from '@jest/globals';
import { z } from 'zod';

import { createObjectTaskDefinition, objectTaskSchema } from '../object.tasks';

/* fixtures */

const data = {
  objectKey: 'path/to/object',
  bucketId: '00000000-0000-4000-8000-000000000001',
  totalSizeBytes: 7n,
  contentType: 'application/octet-stream',
  data: Buffer.from('payload')
};

/* tests */

describe('object task definitions', () => {
  test('dehydrates bytes out of persisted task data and hydrates them again', () => {
    const dehydrated = createObjectTaskDefinition.dehydrateData(data);

    expect(dehydrated).toEqual({
      data: {
        objectKey: data.objectKey,
        bucketId: data.bucketId,
        totalSizeBytes: data.totalSizeBytes,
        contentType: data.contentType
      },
      payload: data.data
    });
    expect(createObjectTaskDefinition.hydrateData(dehydrated.data, dehydrated.payload)).toEqual(data);
  });

  test('encodes and decodes bigint task metadata', () => {
    const encoded = z.encode(createObjectTaskDefinition.persistedDataSchema, {
      objectKey: data.objectKey,
      bucketId: data.bucketId,
      totalSizeBytes: data.totalSizeBytes,
      contentType: data.contentType
    });

    expect(encoded).toMatchObject({ totalSizeBytes: '7' });
    expect(z.decode(createObjectTaskDefinition.persistedDataSchema, encoded)).toMatchObject({ totalSizeBytes: 7n });
  });

  test('parses an object creation task', () => {
    expect(
      objectTaskSchema.parse({
        id: '00000000-0000-4000-8000-000000000002',
        originMasterNodeId: 'master-node-aaaaaaaaaaaa',
        epoch: 1n,
        sequence: 1n,
        state: 'pending',
        revision: 0n,
        type: 'object.create',
        executionScope: 'cluster',
        data: {
          ...data,
          totalSizeBytes: data.totalSizeBytes.toString(),
          data: data.data.toString('base64')
        }
      })
    ).toMatchObject({ type: 'object.create', data });
  });
});
