import { ServerCredentials } from '@grpc/grpc-js';

import type { GrpcMtlsConfig } from '../../config/grpc-mtls.config';
import type { GrpcServerCredentialsContract } from './grpc-server-credentials.contract';

/**/

export class MtlsGrpcServerCredentials implements GrpcServerCredentialsContract {
  constructor(private readonly config: GrpcMtlsConfig) {}

  get(): ServerCredentials {
    return ServerCredentials.createSsl(
      this.config.caCertificate,
      [
        {
          private_key: this.config.privateKey,
          cert_chain: this.config.certificate
        }
      ],
      true
    );
  }
}
