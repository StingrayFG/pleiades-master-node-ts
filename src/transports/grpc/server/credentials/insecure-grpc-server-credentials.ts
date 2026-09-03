import { ServerCredentials } from '@grpc/grpc-js';

import type { GrpcServerCredentialsContract } from './grpc-server-credentials.contract';

/**/

export class InsecureGrpcServerCredentials implements GrpcServerCredentialsContract {
  get(): ServerCredentials {
    return ServerCredentials.createInsecure();
  }
}
