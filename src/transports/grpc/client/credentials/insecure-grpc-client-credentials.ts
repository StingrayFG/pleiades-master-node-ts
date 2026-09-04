import { credentials, type ChannelCredentials } from '@grpc/grpc-js';

import type { GrpcClientCredentialsContract } from './grpc-client-credentials.contract';

/**/

export class InsecureGrpcClientCredentials implements GrpcClientCredentialsContract {
  get(): ChannelCredentials {
    return credentials.createInsecure();
  }
}
