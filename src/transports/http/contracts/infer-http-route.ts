import type { z } from 'zod';

type InferHttpRoute<
  T extends {
    params?: z.ZodType;
    querystring?: z.ZodType;
    body?: z.ZodType;
    response?: Record<number, z.ZodType>;
  }
> = {
  Params: T extends { params: infer P extends z.ZodType } ? z.output<P> : unknown;

  Querystring: T extends { querystring: infer Q extends z.ZodType } ? z.output<Q> : unknown;

  Body: T extends { body: infer B extends z.ZodType } ? z.output<B> : unknown;

  Reply: T extends {
    response: infer R extends Record<number, z.ZodType>;
  }
    ? {
        [K in keyof R]: z.output<R[K]>;
      }
    : unknown;
};

export type { InferHttpRoute };
