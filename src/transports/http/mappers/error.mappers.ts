import { LocalApplicationError, type LocalApplicationErrorCode } from '@/errors/application.errors';
import {
  badRequestHttpErrorDefinition,
  conflictHttpErrorDefinition,
  forbiddenHttpErrorDefinition,
  gatewayTimeoutHttpErrorDefinition,
  insufficientStorageHttpErrorDefinition,
  internalServerErrorHttpErrorDefinition,
  notFoundHttpErrorDefinition,
  serviceUnavailableHttpErrorDefinition,
  unauthorizedHttpErrorDefinition,
  type KnownHttpErrorStatusCode,
  type KnownHttpErrorDefinition
} from '@/transports/http/schemas/error.schemas';

/* maps */

const httpErrorDefinitionByLocalApplicationErrorCode = {
  BAD_REQUEST: badRequestHttpErrorDefinition,
  UNAUTHORIZED: unauthorizedHttpErrorDefinition,
  FORBIDDEN: forbiddenHttpErrorDefinition,
  NOT_FOUND: notFoundHttpErrorDefinition,
  ALREADY_EXISTS: conflictHttpErrorDefinition,
  CONFLICT: conflictHttpErrorDefinition,
  FAILED_PRECONDITION: conflictHttpErrorDefinition,
  DATA_LOSS: internalServerErrorHttpErrorDefinition,
  RESOURCE_EXHAUSTED: insufficientStorageHttpErrorDefinition,
  UNAVAILABLE: serviceUnavailableHttpErrorDefinition,
  DEADLINE_EXCEEDED: gatewayTimeoutHttpErrorDefinition,
  ABORTED: conflictHttpErrorDefinition,
  INTERNAL_SERVER_ERROR: internalServerErrorHttpErrorDefinition,
  MAPPER_ERROR: internalServerErrorHttpErrorDefinition
} satisfies Record<LocalApplicationErrorCode, KnownHttpErrorDefinition>;

const knownHttpErrorDefinitionByStatusCode = {
  400: badRequestHttpErrorDefinition,
  401: unauthorizedHttpErrorDefinition,
  403: forbiddenHttpErrorDefinition,
  404: notFoundHttpErrorDefinition,
  409: conflictHttpErrorDefinition,
  500: internalServerErrorHttpErrorDefinition,
  503: serviceUnavailableHttpErrorDefinition,
  504: gatewayTimeoutHttpErrorDefinition,
  507: insufficientStorageHttpErrorDefinition
} satisfies Record<KnownHttpErrorStatusCode, KnownHttpErrorDefinition>;

const knownHttpErrorDefinitionLookup: Partial<Record<number, KnownHttpErrorDefinition>> =
  knownHttpErrorDefinitionByStatusCode;

/* mappers */

const mapLocalApplicationErrorToHttpErrorDefinition = (error: LocalApplicationError): KnownHttpErrorDefinition => {
  return httpErrorDefinitionByLocalApplicationErrorCode[error.code];
};

const mapStatusCodeToKnownHttpErrorDefinition = (statusCode: number): KnownHttpErrorDefinition | undefined => {
  return knownHttpErrorDefinitionLookup[statusCode];
};

/* exports */

export { mapLocalApplicationErrorToHttpErrorDefinition, mapStatusCodeToKnownHttpErrorDefinition };
