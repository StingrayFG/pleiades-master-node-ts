import { Buffer } from 'node:buffer';
import { Readable } from 'node:stream';

import { describe, expect, test } from '@jest/globals';

import { GenericInternalServerError } from '@/errors/application.errors';

import { splitObjectDataIntoPartBytes } from '../object-version-part.processors';

/* helpers */

const collectParts = async (data: Readable, size: number): Promise<Buffer[]> => {
  const parts: Buffer[] = [];

  for await (const part of splitObjectDataIntoPartBytes(data, size)) {
    parts.push(part);
  }

  return parts;
};

/* tests */

describe('splitObjectDataIntoPartBytes', () => {
  test('splits data across arbitrary input chunk boundaries', async () => {
    const parts = await collectParts(Readable.from([Buffer.from('ab'), Buffer.from('cdefg'), Buffer.from('hi')]), 3);

    expect(parts.map((part) => part.toString())).toEqual(['abc', 'def', 'ghi']);
  });

  test('emits a final partial part', async () => {
    const parts = await collectParts(Readable.from([Buffer.from('abcdefg')]), 3);

    expect(parts.map((part) => part.toString())).toEqual(['abc', 'def', 'g']);
  });

  test('emits no parts for an empty stream', async () => {
    await expect(collectParts(Readable.from([]), 3)).resolves.toEqual([]);
  });

  test.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid part size %s', async (partSize) => {
    await expect(collectParts(Readable.from([Buffer.from('data')]), partSize)).rejects.toBeInstanceOf(
      GenericInternalServerError
    );
  });
});
