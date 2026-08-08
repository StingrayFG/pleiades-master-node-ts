import { ApplicationError, type ApplicationErrorCode } from '@/errors/application.errors';
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

/**/

const httpErrorDefinitionByApplicationErrorCode = {
  BAD_REQUEST: badRequestHttpErrorDefinition,
  UNAUTHORIZED: unauthorizedHttpErrorDefinition,
  FORBIDDEN: forbiddenHttpErrorDefinition,
  NOT_FOUND: notFoundHttpErrorDefinition,
  CONFLICT: conflictHttpErrorDefinition,
  INTERNAL_SERVER_ERROR: internalServerErrorHttpErrorDefinition
} satisfies Record<ApplicationErrorCode, KnownHttpErrorDefinition>;

const mapApplicationErrorToHttpErrorDefinition = (error: ApplicationError): KnownHttpErrorDefinition => {
  return httpErrorDefinitionByApplicationErrorCode[error.code];
};

/**/

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

const mapStatusCodeToKnownHttpErrorDefinition = (statusCode: number): KnownHttpErrorDefinition | undefined => {
  return knownHttpErrorDefinitionLookup[statusCode];
};

/**/

export { mapApplicationErrorToHttpErrorDefinition, mapStatusCodeToKnownHttpErrorDefinition };
