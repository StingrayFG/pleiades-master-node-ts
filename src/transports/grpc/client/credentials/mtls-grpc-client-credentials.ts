import { createHash } from 'node:crypto';

import { credentials, type ChannelCredentials } from '@grpc/grpc-js';

import type { GrpcMtlsConfig } from '../../config/grpc-mtls.config';
import type {
  GrpcClientCredentialsContract,
  GrpcClientCredentialsOptions
} from './grpc-client-credentials.contract';

/* credentials */

export class MtlsGrpcClientCredentials implements GrpcClientCredentialsContract {
  constructor(private readonly config: GrpcMtlsConfig) {}

  get(options?: GrpcClientCredentialsOptions): ChannelCredentials {
    const expectedFingerprint = options?.expectedServerCertificateFingerprint;

    return credentials.createSsl(
      this.config.caCertificate,
      this.config.privateKey,
      this.config.certificate,
      expectedFingerprint
        ? {
            checkServerIdentity: (_hostname, certificate) => {
              const actualFingerprint = createHash('sha256').update(certificate.raw).digest('hex');

              if (actualFingerprint !== expectedFingerprint) {
                return new Error('Server certificate fingerprint does not match the expected fingerprint');
              }

              return undefined;
            }
          }
        : undefined
    );
  }
}
