import { createHash } from 'node:crypto';
import type { PeerCertificate } from 'node:tls';

import { GenericUnauthorizedError } from '@/errors/application.errors';

/**/

type GrpcAuthenticatedServerCall = {
  getAuthContext(): {
    sslPeerCertificate?: PeerCertificate;
  };
};

/**/

export const getGrpcPeerCertificateFingerprint = (call: GrpcAuthenticatedServerCall): string => {
  const certificate = call.getAuthContext().sslPeerCertificate;

  if (!certificate?.raw) {
    throw new GenericUnauthorizedError('Authenticated peer certificate is missing');
  }

  return createHash('sha256').update(certificate.raw).digest('hex');
};
