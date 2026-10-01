import type {
  sendUnaryData,
  Server,
  ServerUnaryCall,
  ServiceDefinition,
  UntypedHandleCall,
  UntypedServiceImplementation
} from '@grpc/grpc-js';

import { toGrpcServerError, type ToGrpcServerErrorOptions } from '@/transports/grpc/handlers/error.handler';

/* types */

type UnaryGrpcHandler = (
  call: ServerUnaryCall<unknown, unknown>,
  callback: sendUnaryData<unknown>
) => void | Promise<void>;

/* handler wrapping */

const wrapUnaryGrpcHandler = (handler: UnaryGrpcHandler, options: ToGrpcServerErrorOptions): UntypedHandleCall => {
  return ((call: ServerUnaryCall<unknown, unknown>, callback: sendUnaryData<unknown>) => {
    let completed = false;

    const handleError = (error: unknown) => {
      if (completed) {
        options.onInternalError?.(error);
        return;
      }

      completed = true;

      callback(toGrpcServerError(error, options), null);
    };

    const wrappedCallback: sendUnaryData<unknown> = (error, value, trailer, flags) => {
      if (completed) {
        return;
      }

      completed = true;

      if (error) {
        // do not forward trailer, since it would override the sanitized metadata attached by toGrpcServerError()
        callback(toGrpcServerError(error, options), null, undefined, flags);

        return;
      }

      callback(null, value, trailer, flags);
    };

    try {
      void Promise.resolve(handler(call, wrappedCallback)).catch(handleError);
    } catch (error) {
      handleError(error);
    }
  }) as UntypedHandleCall;
};

const resolveUnaryGrpcHandler = (
  methodName: string,
  originalName: string | undefined,
  implementation: UntypedServiceImplementation
): UnaryGrpcHandler | undefined => {
  const handler = implementation[methodName] ?? (originalName ? implementation[originalName] : undefined);

  if (!handler) {
    return undefined;
  }

  return handler.bind(implementation) as UnaryGrpcHandler;
};

/* service wrapping */

const wrapGrpcServiceImplementation = (
  service: ServiceDefinition,
  implementation: UntypedServiceImplementation,
  options: ToGrpcServerErrorOptions
): UntypedServiceImplementation => {
  const wrappedImplementation: UntypedServiceImplementation = {};

  for (const [methodName, definition] of Object.entries(service)) {
    if (definition.requestStream || definition.responseStream) {
      throw new Error(`gRPC error handler currently supports unary methods only: ${definition.path}`);
    }

    const handler = resolveUnaryGrpcHandler(methodName, definition.originalName, implementation);

    if (!handler) {
      continue;
    }

    wrappedImplementation[methodName] = wrapUnaryGrpcHandler(handler, options);
  }

  return wrappedImplementation;
};

/* service registration */

const registerGrpcServiceWithErrorHandling = (
  server: Server,
  service: ServiceDefinition,
  implementation: UntypedServiceImplementation,
  options: ToGrpcServerErrorOptions = {}
): void => {
  server.addService(service, wrapGrpcServiceImplementation(service, implementation, options));
};

/* exports */

export { registerGrpcServiceWithErrorHandling };
