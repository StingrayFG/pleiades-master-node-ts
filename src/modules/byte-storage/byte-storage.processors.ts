import type { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

import type { ByteStorageChecksum } from './byte-storage.domain';

/* processors */

export const calculateByteStorageChecksum = (bytes: Buffer): ByteStorageChecksum => {
  return createHash('sha256').update(bytes).digest('hex');
};
