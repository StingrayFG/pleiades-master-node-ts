import {
  InternodeAlreadyExistsError,
  InternodeApplicationError,
  InternodeDataLossError,
  InternodeFailedPreconditionError,
  InternodeNotFoundError
} from '@/errors/internode.errors';

import type { PartReplicaState } from './object-version-part.domain';
import { mapDataNodeBlobStateToPartReplicaState } from './object-version-part.domain-policies';

/* types and constants */

const failedGetPartReplicaStates = new Set([
  'pending',
  'deleting',
  'missing',
  'corrupt'
] as const) satisfies ReadonlySet<PartReplicaState>;
const failedCreatePartReplicaStates = new Set([
  'pending',
  'deleting',
  'corrupt'
] as const) satisfies ReadonlySet<PartReplicaState>;

type FailedGetPartReplicaState = typeof failedGetPartReplicaStates extends ReadonlySet<infer T> ? T : never;
type FailedCreatePartReplicaState = typeof failedCreatePartReplicaStates extends ReadonlySet<infer T> ? T : never;

/* resolvers */

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
    const state = mapDataNodeBlobStateToPartReplicaState(error.details.blobState);

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
    const state = mapDataNodeBlobStateToPartReplicaState(error.details.blobState);

    if (failedCreatePartReplicaStates.has(state as FailedCreatePartReplicaState)) {
      return state as FailedCreatePartReplicaState;
    }
  }

  return 'pending';
};
