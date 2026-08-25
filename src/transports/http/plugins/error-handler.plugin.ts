import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import type { OutgoingHttpHeaders } from 'node:http';
import { ZodError } from 'zod';

import { LocalApplicationError, type LocalApplicationErrorCode } from '@/errors/application.errors';
import { InternodeApplicationError } from '@/errors/internode.errors';
import {
  mapLocalApplicationErrorToHttpErrorDefinition,
  mapStatusCodeToKnownHttpErrorDefinition
} from '@/transports/http/mappers/error.mappers';
import {
  badRequestHttpErrorDefinition,
  internalServerErrorHttpErrorDefinition,
  notFoundHttpErrorDefinition,
  type HttpErrorResponsePayload,
  type KnownHttpErrorDefinition
} from '@/transports/http/schemas/error.schemas';

/* types and constants */

type UnknownError = unknown;

type NormalizedUnknownError = {
  statusCode: number;
  message: string;
  headers?: OutgoingHttpHeaders;
};

type ClassifiedError =
  | { kind: 'application-local'; error: LocalApplicationError }
  | { kind: 'application-internode'; error: InternodeApplicationError }
  | { kind: 'validation'; error: UnknownError }
  | { kind: 'client'; error: NormalizedUnknownError }
  | { kind: 'internal'; error: UnknownError };

const INVALID_REQUEST_MESSAGE = 'Invalid request';
const ROUTE_NOT_FOUND_MESSAGE = 'Route not found';
const INTERNAL_SERVER_ERROR_MESSAGE = 'Internal server error';
const HTTP_ERROR_MESSAGE = 'HTTP error';

const localApplicationErrorMessageOverrideByCode: Partial<Record<LocalApplicationErrorCode, string>> = {
  INTERNAL_SERVER_ERROR: INTERNAL_SERVER_ERROR_MESSAGE,
  MAPPING_ERROR: INTERNAL_SERVER_ERROR_MESSAGE
};

const ALLOWED_ERROR_HEADERS = new Set(['www-authenticate', 'retry-after', 'allow']);

/* response helpers */

const sendHttpErrorResponseByPayload = (
  req: FastifyRequest,
  reply: FastifyReply,
  payload: HttpErrorResponsePayload,
  headers?: OutgoingHttpHeaders
) => {
  if (headers) {
    reply.headers(headers);
  }

  return reply
    .code(payload.statusCode)
    .type('application/json')
    .send({
      ...payload,
      requestId: req.id
    });
};

const sendKnownHttpErrorResponseByDefinition = (
  req: FastifyRequest,
  reply: FastifyReply,
  definition: KnownHttpErrorDefinition,
  message: string,
  headers?: OutgoingHttpHeaders
) => {
  return sendHttpErrorResponseByPayload(
    req,
    reply,
    {
      statusCode: definition.statusCode,
      code: definition.code,
      message
    },
    headers
  );
};

/* normalization helpers */

const normalizeErrorHeaders = (value: unknown): OutgoingHttpHeaders | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const headers: OutgoingHttpHeaders = {};

  for (const [name, headerValue] of Object.entries(value)) {
    const normalizedName = name.toLowerCase();

    if (!ALLOWED_ERROR_HEADERS.has(normalizedName)) {
      continue;
    }

    if (
      typeof headerValue === 'string' ||
      typeof headerValue === 'number' ||
      (Array.isArray(headerValue) && headerValue.every((value) => typeof value === 'string'))
    ) {
      headers[normalizedName] = headerValue;
    }
  }

  return Object.keys(headers).length > 0 ? headers : undefined;
};

const normalizeUnknownError = (err: unknown): NormalizedUnknownError | undefined => {
  if (!err || typeof err !== 'object') {
    return undefined;
  }

  const message =
    'message' in err && typeof err.message === 'string' && err.message.length > 0 ? err.message : HTTP_ERROR_MESSAGE;

  const statusCode = 'statusCode' in err && typeof err.statusCode === 'number' ? err.statusCode : undefined;

  if (statusCode === undefined || !Number.isInteger(statusCode) || statusCode < 400 || statusCode >= 500) {
    return undefined;
  }

  const headers = 'headers' in err ? normalizeErrorHeaders(err.headers) : undefined;

  return {
    statusCode,
    message,
    headers
  };
};

const classifyError = (err: unknown): ClassifiedError => {
  if (err instanceof LocalApplicationError) {
    return {
      kind: 'application-local',
      error: err
    };
  }

  if (err instanceof InternodeApplicationError) {
    return {
      kind: 'application-internode',
      error: err
    };
  }

  if (err instanceof ZodError || hasZodFastifySchemaValidationErrors(err)) {
    return {
      kind: 'validation',
      error: err
    };
  }

  const normalizedUnknownError = normalizeUnknownError(err);

  if (normalizedUnknownError) {
    return {
      kind: 'client',
      error: normalizedUnknownError
    };
  }

  return {
    kind: 'internal',
    error: err
  };
};

const resolveLocalApplicationErrorMessage = (error: LocalApplicationError): string => {
  return localApplicationErrorMessageOverrideByCode[error.code] ?? error.message;
};

/* handler */

const errorHandlerPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.setNotFoundHandler((req, reply) => {
    return sendKnownHttpErrorResponseByDefinition(req, reply, notFoundHttpErrorDefinition, ROUTE_NOT_FOUND_MESSAGE);
  });

  fastify.setErrorHandler((err, req, reply) => {
    const classifiedError = classifyError(err);

    switch (classifiedError.kind) {
      case 'application-local': {
        const error = classifiedError.error;

        const definition = mapLocalApplicationErrorToHttpErrorDefinition(error);

        if (definition.statusCode >= 500) {
          req.log.error(err);
        }

        return sendKnownHttpErrorResponseByDefinition(
          req,
          reply,
          definition,
          resolveLocalApplicationErrorMessage(error)
        );
      }

      case 'application-internode': {
        req.log.error(err);

        return sendKnownHttpErrorResponseByDefinition(
          req,
          reply,
          internalServerErrorHttpErrorDefinition,
          INTERNAL_SERVER_ERROR_MESSAGE
        );
      }

      case 'validation':
        return sendKnownHttpErrorResponseByDefinition(
          req,
          reply,
          badRequestHttpErrorDefinition,
          INVALID_REQUEST_MESSAGE
        );

      case 'client': {
        const error = classifiedError.error;

        const definition = mapStatusCodeToKnownHttpErrorDefinition(error.statusCode);

        if (definition) {
          return sendKnownHttpErrorResponseByDefinition(req, reply, definition, error.message, error.headers);
        }

        return sendHttpErrorResponseByPayload(
          req,
          reply,
          {
            statusCode: error.statusCode,
            code: 'HTTP_ERROR',
            message: error.message
          },
          error.headers
        );
      }

      case 'internal': {
        req.log.error(err);

        return sendKnownHttpErrorResponseByDefinition(
          req,
          reply,
          internalServerErrorHttpErrorDefinition,
          INTERNAL_SERVER_ERROR_MESSAGE
        );
      }
    }
  });
};

/* exports */

export default fp(errorHandlerPlugin);
