import type { z } from 'zod';

/**/

type InferHttpRoute<
  TRoute extends {
    params?: z.ZodType;
    headers?: z.ZodType;
    querystring?: z.ZodType;
    body?: z.ZodType;
    response?: Record<number, z.ZodType>;
  }
> = {
  Params: TRoute extends { params: infer TParamsSchema extends z.ZodType } ? z.output<TParamsSchema> : unknown;

  Headers: TRoute extends { headers: infer THeadersSchema extends z.ZodType } ? z.output<THeadersSchema> : unknown;

  Querystring: TRoute extends { querystring: infer TQuerystringSchema extends z.ZodType }
    ? z.output<TQuerystringSchema>
    : unknown;

  Body: TRoute extends { body: infer TBodySchema extends z.ZodType } ? z.output<TBodySchema> : unknown;

  Reply: TRoute extends {
    response: infer TResponseSchemas extends Record<number, z.ZodType>;
  }
    ? {
        [TStatusCode in keyof TResponseSchemas]: z.output<TResponseSchemas[TStatusCode]>;
      }
    : unknown;
};

/**/

export type { InferHttpRoute };
