import { readFileSync } from 'node:fs';

import env from '@/env';

import type { GrpcMtlsConfig } from './grpc-mtls.config';

/**/

export const loadGrpcMtlsConfig = (): GrpcMtlsConfig => {
  return {
    caCertificate: readFileSync(env.GRPC_CA_CERT_PATH),
    certificate: readFileSync(env.GRPC_CERT_PATH),
    privateKey: readFileSync(env.GRPC_PRIVATE_KEY_PATH)
  };
};
