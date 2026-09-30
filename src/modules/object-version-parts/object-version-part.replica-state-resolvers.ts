import {
  InternodeAlreadyExistsError,
  InternodeApplicationError,
  InternodeDataLossError,
  InternodeFailedPreconditionError,
  InternodeNotFoundError
} from '@/errors/internode.errors';
import type { DataNodeBlobState } from '@/modules/blobs/blob.domain';

import type { PartReplicaState } from './object-version-part.domain';

/* types and constants */

const partReplicaStateByDataNodeBlobState = {
  pending: 'pending',
  temp: 'pending',
  committed: 'committed',
  deleting: 'deleting',
  corrupt: 'corrupt',
  missing: 'missing'
} as const satisfies Record<DataNodeBlobState, PartReplicaState>;

const failedGetPartReplicaStates = new Set([
  'pending',
  'missing',
  'corrupt'
] as const) satisfies ReadonlySet<PartReplicaState>;
const failedCreatePartReplicaStates = new Set([
  'pending',
  'missing',
  'corrupt'
] as const) satisfies ReadonlySet<PartReplicaState>;

type FailedGetPartReplicaState = typeof failedGetPartReplicaStates extends ReadonlySet<infer T> ? T : never;
type FailedCreatePartReplicaState = typeof failedCreatePartReplicaStates extends ReadonlySet<infer T> ? T : never;

/* resolvers */

export const resolvePartReplicaStateFromDataNodeBlobState = (state: DataNodeBlobState): PartReplicaState => {
  return partReplicaStateByDataNodeBlobState[state];
};

export const resolveFailedGetPartReplicaState = (
  error: InternodeApplicationError
): FailedGetPartReplicaState | null => {
  if (error instanceof InternodeNotFoundError) {
    return 'missing';
  }

  if (error instanceof InternodeDataLossError) {
    return 'corrupt';
  }

  if (error instanceof InternodeFailedPreconditionError && error.details?.blobState) {
    const state = resolvePartReplicaStateFromDataNodeBlobState(error.details.blobState);

    if (state === 'deleting') {
      return 'missing';
    }

    return failedGetPartReplicaStates.has(state as FailedGetPartReplicaState)
      ? (state as FailedGetPartReplicaState)
      : null;
  }

  return null;
};

export const resolveFailedCreatePartReplicaState = (error: InternodeApplicationError): FailedCreatePartReplicaState => {
  if (error instanceof InternodeAlreadyExistsError || error instanceof InternodeDataLossError) {
    return 'corrupt';
  }

  if (error instanceof InternodeFailedPreconditionError && error.details?.blobState) {
    const state = resolvePartReplicaStateFromDataNodeBlobState(error.details.blobState);

    if (state === 'deleting') {
      return 'missing';
    }

    if (failedCreatePartReplicaStates.has(state as FailedCreatePartReplicaState)) {
      return state as FailedCreatePartReplicaState;
    }
  }

  return 'pending';
};
