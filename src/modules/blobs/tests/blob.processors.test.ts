import { Buffer } from 'node:buffer';

import { createHash } from 'node:crypto';
import { describe, expect, test } from '@jest/globals';

import { calculateBlobChecksum } from '../blob.processors';

/* tests */

describe('blob processors', () => {
  test('calculates a lowercase SHA-256 checksum', () => {
    const bytes = Buffer.from('blob data');
    const expected = createHash('sha256').update(bytes).digest('hex');

    expect(calculateBlobChecksum(bytes)).toBe(expected);
  });

  test('calculates the SHA-256 checksum for an empty payload', () => {
    expect(calculateBlobChecksum(Buffer.alloc(0))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
  });
});
