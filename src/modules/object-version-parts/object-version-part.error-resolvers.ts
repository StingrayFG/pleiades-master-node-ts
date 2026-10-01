import {
  GenericAbortedError,
  GenericDataLossError,
  GenericDeadlineExceededError,
  GenericFailedPreconditionError,
  GenericInternalServerError,
  GenericResourceExhaustedError,
  GenericUnavailableError,
  type LocalApplicationError
} from '@/errors/application.errors';
import { createAggregateErrorCause, type ErrorCauseEntry } from '@/errors/error.causes';
import {
  InternodeAbortedError,
  InternodeAlreadyExistsError,
  InternodeApplicationError,
  InternodeDataLossError,
  InternodeDeadlineExceededError,
  InternodeFailedPreconditionError,
  InternodeNotFoundError,
  InternodeResourceExhaustedError,
  InternodeUnavailableError
} from '@/errors/internode.errors';

/* types */

export type GetPartBlobError =
  | ErrorCauseEntry<'data-node-resolution'>
  | ErrorCauseEntry<'replica-read', InternodeApplicationError>
  | ErrorCauseEntry<'replica-state-update'>;

export type CreatePartReplicasError = ErrorCauseEntry<'replica-create'> | ErrorCauseEntry<'replica-state-update'>;

/* resolvers */

export const resolveFailedGetPartBlobError = (errors: readonly GetPartBlobError[]): LocalApplicationError => {
  const cause = createAggregateErrorCause(errors);

  if (errors.some(({ source }) => source === 'replica-state-update')) {
    return new GenericInternalServerError('Failed to read object version part and update replica state', { cause });
  }

  if (
    errors.length > 0 &&
    errors.every(
      ({ source, error }) =>
        source === 'replica-read' &&
        (error instanceof InternodeDataLossError || error instanceof InternodeNotFoundError)
    )
  ) {
    return new GenericDataLossError('Object version part is unavailable from all committed replicas', { cause });
  }

  if (
    errors.length > 0 &&
    errors.every(({ source, error }) => source === 'replica-read' && error instanceof InternodeFailedPreconditionError)
  ) {
    return new GenericFailedPreconditionError('Object version part replicas are not in a readable state', { cause });
  }

  if (
    errors.length > 0 &&
    errors.every(
      ({ error }) => error instanceof InternodeDeadlineExceededError || error instanceof GenericDeadlineExceededError
    )
  ) {
    return new GenericDeadlineExceededError('Object version part replica reads exceeded their deadline', { cause });
  }

  const hasAvailabilityError = errors.some(
    ({ error }) =>
      error instanceof InternodeUnavailableError ||
      error instanceof InternodeDeadlineExceededError ||
      error instanceof GenericUnavailableError ||
      error instanceof GenericDeadlineExceededError
  );

  if (
    hasAvailabilityError &&
    errors.every(
      ({ source, error }) =>
        error instanceof InternodeUnavailableError ||
        error instanceof InternodeDeadlineExceededError ||
        error instanceof GenericUnavailableError ||
        error instanceof GenericDeadlineExceededError ||
        (source === 'replica-read' &&
          (error instanceof InternodeNotFoundError || error instanceof InternodeDataLossError))
    )
  ) {
    return new GenericUnavailableError('Object version part replicas are unavailable', { cause });
  }

  if (
    errors.length > 0 &&
    errors.every(({ error }) => error instanceof InternodeAbortedError || error instanceof GenericAbortedError)
  ) {
    return new GenericAbortedError('Object version part read was aborted', { cause });
  }

  return new GenericInternalServerError('Failed to read object version part from all committed replicas', { cause });
};

export const resolveFailedCreatePartReplicasError = (
  errors: readonly CreatePartReplicasError[]
): LocalApplicationError => {
  const cause = createAggregateErrorCause(errors);

  if (errors.some(({ source }) => source === 'replica-state-update')) {
    return new GenericInternalServerError('Failed to replicate object version part and update replica states', {
      cause
    });
  }

  const replicaErrors = errors.filter(({ source }) => source === 'replica-create').map(({ error }) => error);

  if (replicaErrors.length === 0 || replicaErrors.some((error) => !(error instanceof InternodeApplicationError))) {
    return new GenericInternalServerError('Failed to replicate blob to all responsible data nodes', { cause });
  }

  if (
    replicaErrors.every(
      (error) => error instanceof InternodeDataLossError || error instanceof InternodeAlreadyExistsError
    )
  ) {
    return new GenericDataLossError('Object version part replication encountered inconsistent stored data', { cause });
  }

  if (replicaErrors.every((error) => error instanceof InternodeResourceExhaustedError)) {
    return new GenericResourceExhaustedError('Insufficient storage capacity to replicate object version part', {
      cause
    });
  }

  if (replicaErrors.every((error) => error instanceof InternodeFailedPreconditionError)) {
    return new GenericFailedPreconditionError('Responsible data nodes are not in a state that permits replication', {
      cause
    });
  }

  if (replicaErrors.every((error) => error instanceof InternodeAbortedError)) {
    return new GenericAbortedError('Object version part replication was aborted', { cause });
  }

  if (replicaErrors.every((error) => error instanceof InternodeDeadlineExceededError)) {
    return new GenericDeadlineExceededError('Object version part replication exceeded its deadline', { cause });
  }

  if (
    replicaErrors.every(
      (error) => error instanceof InternodeUnavailableError || error instanceof InternodeDeadlineExceededError
    )
  ) {
    return new GenericUnavailableError('One or more responsible data nodes are unavailable', { cause });
  }

  return new GenericInternalServerError('Failed to replicate blob to all responsible data nodes', { cause });
};
