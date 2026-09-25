import type { Buffer } from 'node:buffer';
import { createHash, X509Certificate } from 'node:crypto';

import { GenericInternalServerError } from '@/errors/application.errors';

import { masterNodeCertificateFingerprintSchema, type MasterNodeCertificateFingerprint } from './master-node.domain';

/* processors */

export const calculateMasterNodeCertificateFingerprint = (certificate: Buffer): MasterNodeCertificateFingerprint => {
  try {
    const parsedCertificate = new X509Certificate(certificate);

    const fingerprint = createHash('sha256').update(parsedCertificate.raw).digest('hex');

    return masterNodeCertificateFingerprintSchema.parse(fingerprint);
  } catch (err) {
    throw new GenericInternalServerError('Failed to calculate the master node certificate fingerprint', {
      cause: err
    });
  }
};
