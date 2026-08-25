import { LocalApplicationError, type LocalApplicationErrorCode } from '@/errors/application.errors';
import {
  badRequestHttpErrorDefinition,
  conflictHttpErrorDefinition,
  forbiddenHttpErrorDefinition,
  internalServerErrorHttpErrorDefinition,
  notFoundHttpErrorDefinition,
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
  CONFLICT: conflictHttpErrorDefinition,
  INTERNAL_SERVER_ERROR: internalServerErrorHttpErrorDefinition,
  MAPPING_ERROR: internalServerErrorHttpErrorDefinition
} satisfies Record<LocalApplicationErrorCode, KnownHttpErrorDefinition>;

const knownHttpErrorDefinitionByStatusCode = {
  400: badRequestHttpErrorDefinition,
  401: unauthorizedHttpErrorDefinition,
  403: forbiddenHttpErrorDefinition,
  404: notFoundHttpErrorDefinition,
  409: conflictHttpErrorDefinition,
  500: internalServerErrorHttpErrorDefinition
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
