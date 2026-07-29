import { createHash } from 'crypto';

import env from '@/env';

export const calculatePlacementGroup = ({ blobId }: { blobId: string }): number => {
  const groupCount = Number(env.PLACEMENT_GROUP_COUNT);
  const hash = createHash('sha256').update(blobId).digest();

  return hash.readUInt32BE(0) % groupCount;
};
