import { credentials, type ChannelCredentials } from '@grpc/grpc-js';

import { GenericFailedPreconditionError } from '@/errors/application.errors';

import type {
  GrpcClientCredentialsContract,
  GrpcClientCredentialsOptions
} from './grpc-client-credentials.contract';

/* credentials */

export class InsecureGrpcClientCredentials implements GrpcClientCredentialsContract {
  get(options?: GrpcClientCredentialsOptions): ChannelCredentials {
    if (options?.expectedServerCertificateFingerprint) {
      throw new GenericFailedPreconditionError(
        'Server certificate fingerprints cannot be verified with insecure gRPC credentials'
      );
    }

    return credentials.createInsecure();
  }
}
