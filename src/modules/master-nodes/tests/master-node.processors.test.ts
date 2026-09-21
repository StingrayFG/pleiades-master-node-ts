import { Buffer } from 'node:buffer';
import { X509Certificate } from 'node:crypto';
import { rootCertificates } from 'node:tls';

import { describe, expect, test } from '@jest/globals';

import { GenericInternalServerError } from '@/errors/application.errors';

import { calculateMasterNodeCertificateFingerprint } from '../master-node.processors';

/* tests */

describe('master node processors', () => {
  test('calculates a lowercase SHA-256 fingerprint from a certificate', () => {
    const certificate = Buffer.from(rootCertificates[0]);
    const expectedFingerprint = new X509Certificate(certificate).fingerprint256.replaceAll(':', '').toLowerCase();

    expect(calculateMasterNodeCertificateFingerprint(certificate)).toBe(expectedFingerprint);
  });

  test('wraps invalid certificate failures in an internal error', () => {
    expect(() => calculateMasterNodeCertificateFingerprint(Buffer.from('invalid certificate'))).toThrow(
      GenericInternalServerError
    );
  });
});
