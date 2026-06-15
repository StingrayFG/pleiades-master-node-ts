import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { HttpError } from '@/errors';

type ErrorStatus = {
  statusCode?: number;
  message?: string;
  code?: string;
};

const getErrorStatus = (err: unknown): number | undefined => {
  if (!err || typeof err !== 'object') return undefined;
  const statusCode = (err as ErrorStatus).statusCode;
  return typeof statusCode === 'number' ? statusCode : undefined;
};

const getErrorMessage = (err: unknown): string => {
  if (!err || typeof err !== 'object') return 'Error';
  const message = (err as ErrorStatus).message;
  return typeof message === 'string' && message.length > 0 ? message : 'Error';
};

const errorHandlerPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.setErrorHandler((err, req, reply) => {
    // If it's one of "your" errors, map it predictably
    if (err instanceof HttpError) {
      return reply.code(err.statusCode).send({
        message: err.message,
        code: err.code
      });
    }

    // Initially added for the @fastify/csrf-protection
    const statusCode = getErrorStatus(err);
    if (statusCode) {
      return reply.code(statusCode).send({
        message: getErrorMessage(err)
      });
    }

    // Otherwise treat as unexpected
    req.log.error(err);
    return reply.code(500).send({ message: 'Internal Server Error' });
  });
};

export default fp(errorHandlerPlugin);
