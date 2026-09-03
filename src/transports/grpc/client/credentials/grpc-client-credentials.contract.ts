import type { ChannelCredentials } from '@grpc/grpc-js';

/**/

export type GrpcClientCredentialsContract = {
  get(): ChannelCredentials;
};
