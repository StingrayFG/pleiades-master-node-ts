import type { ChannelCredentials } from '@grpc/grpc-js';

/* options */

type GrpcClientCredentialsOptions = {
  expectedServerCertificateFingerprint?: string;
};

/* contract */

export type GrpcClientCredentialsContract = {
  get(options?: GrpcClientCredentialsOptions): ChannelCredentials;
};

/* exports */

export type { GrpcClientCredentialsOptions };
