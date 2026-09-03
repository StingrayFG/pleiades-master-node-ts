import type { ServerCredentials } from '@grpc/grpc-js';

/**/

export type GrpcServerCredentialsContract = {
  get(): ServerCredentials;
};
