import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import fp from 'fastify-plugin';
import type { OutgoingHttpHeaders } from 'node:http';

import { ApplicationError } from '@/errors/application.errors';
import {
  mapApplicationErrorToHttpErrorDefinition,
  mapStatusCodeToKnownHttpErrorDefinition
} from '@/transports/http/mappers/error.mappers';
import {
  badRequestHttpErrorDefinition,
  HttpErrorResponsePayload,
  internalServerErrorHttpErrorDefinition,
  notFoundHttpErrorDefinition,
  type KnownHttpErrorDefinition
} from '@/transports/http/schemas/error.schemas';

/**/

type UnknownError = unknown;

type NormalizedUnknownError = {
  statusCode: number;
  message: string;
  headers?: OutgoingHttpHeaders;
};

type ClassifiedError =
  | { kind: 'application'; error: ApplicationError }
  | { kind: 'validation'; error: UnknownError }
  | { kind: 'client'; error: NormalizedUnknownError }
  | { kind: 'internal'; error: UnknownError };

const INVALID_REQUEST_MESSAGE = 'Invalid request';
const ROUTE_NOT_FOUND_MESSAGE = 'Route not found';
const INTERNAL_SERVER_ERROR_MESSAGE = 'Internal server error';
const HTTP_ERROR_MESSAGE = 'HTTP error';

const ALLOWED_ERROR_HEADERS = new Set(['www-authenticate', 'retry-after', 'allow']);

/**/

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

/**/

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
  if (err instanceof ApplicationError) {
    return {
      kind: 'application',
      error: err
    };
  }

  if (hasZodFastifySchemaValidationErrors(err)) {
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

/**/

const errorHandlerPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.setNotFoundHandler((req, reply) => {
    return sendKnownHttpErrorResponseByDefinition(req, reply, notFoundHttpErrorDefinition, ROUTE_NOT_FOUND_MESSAGE);
  });

  fastify.setErrorHandler((err, req, reply) => {
    const classifiedError = classifyError(err);

    switch (classifiedError.kind) {
      case 'application': {
        const error = classifiedError.error;

        const definition = mapApplicationErrorToHttpErrorDefinition(error);

        if (definition.statusCode >= 500) {
          req.log.error(error);
        }

        const message = definition.statusCode >= 500 ? INTERNAL_SERVER_ERROR_MESSAGE : error.message;

        return sendKnownHttpErrorResponseByDefinition(req, reply, definition, message);
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

      case 'internal':
        req.log.error(classifiedError.error);

        return sendKnownHttpErrorResponseByDefinition(
          req,
          reply,
          internalServerErrorHttpErrorDefinition,
          INTERNAL_SERVER_ERROR_MESSAGE
        );
    }
  });
};

export default fp(errorHandlerPlugin);
