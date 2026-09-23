import { describe, expect, test } from '@jest/globals';

import {
  GenericAbortedError,
  GenericDataLossError,
  GenericDeadlineExceededError,
  GenericFailedPreconditionError,
  GenericInternalServerError,
  GenericResourceExhaustedError,
  GenericUnavailableError
} from '@/errors/application.errors';
import {
  InternodeAbortedError,
  InternodeAlreadyExistsError,
  InternodeDataLossError,
  InternodeDeadlineExceededError,
  InternodeFailedPreconditionError,
  InternodeInternalError,
  InternodeNotFoundError,
  InternodeResourceExhaustedError,
  InternodeUnavailableError
} from '@/errors/internode.errors';

import {
  resolveFailedCreatePartReplicasError,
  resolveFailedGetPartBlobError
} from '../object-version-part.error-resolvers';

/* tests */

describe('resolveFailedGetPartBlobError', () => {
  test('prioritizes replica-state update failures', () => {
    expect(
      resolveFailedGetPartBlobError([{ source: 'replica-state-update', error: new Error('database failed') }])
    ).toBeInstanceOf(GenericInternalServerError);
  });

  test('classifies uniformly unavailable or corrupt replicas', () => {
    expect(
      resolveFailedGetPartBlobError([
        { source: 'replica-read', error: new InternodeNotFoundError() },
        { source: 'replica-read', error: new InternodeDataLossError() }
      ])
    ).toBeInstanceOf(GenericDataLossError);
    expect(
      resolveFailedGetPartBlobError([
        { source: 'replica-read', error: new InternodeFailedPreconditionError() },
        { source: 'replica-read', error: new InternodeFailedPreconditionError() }
      ])
    ).toBeInstanceOf(GenericFailedPreconditionError);
  });

  test('classifies deadline, availability, and abort failures', () => {
    expect(
      resolveFailedGetPartBlobError([
        { source: 'replica-read', error: new InternodeDeadlineExceededError() },
        { source: 'data-node-resolution', error: new GenericDeadlineExceededError() }
      ])
    ).toBeInstanceOf(GenericDeadlineExceededError);
    expect(
      resolveFailedGetPartBlobError([
        { source: 'replica-read', error: new InternodeUnavailableError() },
        { source: 'replica-read', error: new InternodeNotFoundError() }
      ])
    ).toBeInstanceOf(GenericUnavailableError);
    expect(
      resolveFailedGetPartBlobError([
        { source: 'replica-read', error: new InternodeAbortedError() },
        { source: 'data-node-resolution', error: new GenericAbortedError() }
      ])
    ).toBeInstanceOf(GenericAbortedError);
  });

  test('falls back to an internal error for mixed unclassified failures', () => {
    expect(
      resolveFailedGetPartBlobError([
        { source: 'replica-read', error: new InternodeInternalError() },
        { source: 'data-node-resolution', error: new Error('resolution failed') }
      ])
    ).toBeInstanceOf(GenericInternalServerError);
  });
});

describe('resolveFailedCreatePartReplicasError', () => {
  test('prioritizes replica-state update and unknown failures as internal errors', () => {
    expect(
      resolveFailedCreatePartReplicasError([{ source: 'replica-state-update', error: new Error('database failed') }])
    ).toBeInstanceOf(GenericInternalServerError);
    expect(resolveFailedCreatePartReplicasError([])).toBeInstanceOf(GenericInternalServerError);
    expect(
      resolveFailedCreatePartReplicasError([{ source: 'replica-create', error: new Error('unexpected') }])
    ).toBeInstanceOf(GenericInternalServerError);
  });

  test.each([
    [[new InternodeDataLossError(), new InternodeAlreadyExistsError()], GenericDataLossError],
    [[new InternodeResourceExhaustedError()], GenericResourceExhaustedError],
    [[new InternodeFailedPreconditionError()], GenericFailedPreconditionError],
    [[new InternodeAbortedError()], GenericAbortedError],
    [[new InternodeDeadlineExceededError()], GenericDeadlineExceededError],
    [[new InternodeUnavailableError(), new InternodeDeadlineExceededError()], GenericUnavailableError]
  ] as const)('classifies replica creation errors', (errors, ExpectedError) => {
    expect(
      resolveFailedCreatePartReplicasError(errors.map((error) => ({ source: 'replica-create', error })))
    ).toBeInstanceOf(ExpectedError);
  });
});
