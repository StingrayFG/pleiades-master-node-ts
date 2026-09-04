import { credentials, type ChannelCredentials } from '@grpc/grpc-js';

import type { GrpcMtlsConfig } from '../../config/grpc-mtls.config';
import type { GrpcClientCredentialsContract } from './grpc-client-credentials.contract';

/**/

export class MtlsGrpcClientCredentials implements GrpcClientCredentialsContract {
  constructor(private readonly config: GrpcMtlsConfig) {}

  get(): ChannelCredentials {
    return credentials.createSsl(this.config.caCertificate, this.config.privateKey, this.config.certificate);
  }
}
