/* type */

export type ErrorCauseEntry<TSource extends string = string, TError = unknown> = {
  source: TSource;
  error: TError;
};

/* factory */

export const createAggregateErrorCause = (errors: readonly ErrorCauseEntry[]): AggregateError => {
  return new AggregateError(errors);
};
