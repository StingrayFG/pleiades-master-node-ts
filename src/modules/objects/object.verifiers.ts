import { GenericDataLossError } from '@/errors/application.errors';

import type { Part } from '@/modules/object-version-parts/object-version-part.domain';

import type { ObjectVersion } from './object.domain';

/* verifiers */

export const verifyObjectVersionParts = (objectVersion: ObjectVersion, parts: readonly Part[]): void => {
  let totalSizeBytes = 0n;

  for (const [index, part] of parts.entries()) {
    if (
      part.objectId !== objectVersion.objectId ||
      part.version !== objectVersion.version ||
      part.partNumber !== index + 1
    ) {
      throw new GenericDataLossError('Current object version parts are inconsistent');
    }

    totalSizeBytes += part.sizeBytes;
  }

  if (totalSizeBytes !== objectVersion.totalSizeBytes) {
    throw new GenericDataLossError('Current object version parts are inconsistent');
  }
};
