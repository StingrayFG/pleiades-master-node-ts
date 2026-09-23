import { describe, expect, test } from '@jest/globals';

import {
  InternodeAbortedError,
  InternodeAlreadyExistsError,
  InternodeDataLossError,
  InternodeFailedPreconditionError,
  InternodeNotFoundError
} from '@/errors/internode.errors';

import {
  resolveFailedCreatePartReplicaState,
  resolveFailedGetPartReplicaState
} from '../object-version-part.replica-state-resolvers';

/* tests */

describe('part replica state resolvers', () => {
  test('maps failed reads to durable replica states', () => {
    expect(resolveFailedGetPartReplicaState(new InternodeNotFoundError())).toBe('missing');
    expect(resolveFailedGetPartReplicaState(new InternodeDataLossError())).toBe('corrupt');
    expect(
      resolveFailedGetPartReplicaState(
        new InternodeFailedPreconditionError('failed', { blobId: 'blob', blobState: 'deleting' })
      )
    ).toBe('missing');
    expect(
      resolveFailedGetPartReplicaState(
        new InternodeFailedPreconditionError('failed', { blobId: 'blob', blobState: 'pending' })
      )
    ).toBe('pending');
  });

  test('leaves retryable or readable failed-read states unresolved', () => {
    expect(resolveFailedGetPartReplicaState(new InternodeAbortedError())).toBeNull();
    expect(
      resolveFailedGetPartReplicaState(
        new InternodeFailedPreconditionError('failed', { blobId: 'blob', blobState: 'committed' })
      )
    ).toBeNull();
  });

  test('maps failed creates to repairable replica states', () => {
    expect(resolveFailedCreatePartReplicaState(new InternodeAlreadyExistsError())).toBe('corrupt');
    expect(resolveFailedCreatePartReplicaState(new InternodeDataLossError())).toBe('corrupt');
    expect(
      resolveFailedCreatePartReplicaState(
        new InternodeFailedPreconditionError('failed', { blobId: 'blob', blobState: 'deleting' })
      )
    ).toBe('missing');
    expect(
      resolveFailedCreatePartReplicaState(
        new InternodeFailedPreconditionError('failed', { blobId: 'blob', blobState: 'missing' })
      )
    ).toBe('missing');
  });

  test('keeps unclassified create failures pending for reconciliation', () => {
    expect(resolveFailedCreatePartReplicaState(new InternodeAbortedError())).toBe('pending');
  });
});
