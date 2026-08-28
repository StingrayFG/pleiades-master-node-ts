import { Buffer } from 'node:buffer';
import type { Readable } from 'node:stream';

/* processors */

export const splitObjectDataIntoPartBytes = async function* (
  data: Readable,
  partSizeBytes: number
): AsyncGenerator<Buffer> {
  if (!Number.isSafeInteger(partSizeBytes) || partSizeBytes <= 0) {
    throw new Error('Invalid object version part size');
  }

  let chunks: Buffer[] = [];
  let bufferedBytes = 0;

  for await (const chunk of data) {
    let remaining = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

    while (bufferedBytes + remaining.length >= partSizeBytes) {
      const bytesNeeded = partSizeBytes - bufferedBytes;

      chunks.push(remaining.subarray(0, bytesNeeded));

      const partBytes = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks, partSizeBytes);

      remaining = remaining.subarray(bytesNeeded);
      chunks = [];
      bufferedBytes = 0;

      yield partBytes;
    }

    if (remaining.length > 0) {
      chunks.push(remaining);
      bufferedBytes += remaining.length;
    }
  }

  if (bufferedBytes > 0) {
    const partBytes = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks, bufferedBytes);

    chunks.length = 0;

    yield partBytes;
  }
};
