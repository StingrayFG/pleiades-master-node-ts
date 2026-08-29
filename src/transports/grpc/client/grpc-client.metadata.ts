import { Metadata } from '@grpc/grpc-js';
import { createSigner } from 'fast-jwt';

import env from '@/env';

/* signer */

const signInternodeToken = createSigner({
  algorithm: 'HS256',
  expiresIn: '1m',
  key: env.JWT_TOKEN_SECRET,
  sub: 'master-node'
});

/* factory */

const createAuthenticatedGrpcMetadata = (): Metadata => {
  const metadata = new Metadata();
  const token = signInternodeToken({});

  metadata.set('authorization', `Bearer ${token}`);

  return metadata;
};

/* exports */

export { createAuthenticatedGrpcMetadata };
