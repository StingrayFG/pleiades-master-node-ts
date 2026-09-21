import { describe, expect, test } from '@jest/globals';

import {
  applyMasterNodeRegistrationRepositoryInputSchema,
  registerMasterNodeInputSchema
} from '../master-node.application';

/* fixtures */

const registrationInput = {
  id: 'master-node-012345abcdef',

  certificateFingerprint: 'ab'.repeat(32),
  sessionId: '00000000-0000-4000-8000-000000000001',
  state: 'active',
  mode: 'serving',

  endpoint: {
    hostname: 'master-node.internal',
    port: 50051,
    scheme: 'grpcs'
  }
} as const;

/* tests */

describe('master node application schemas', () => {
  test('accepts a valid registration input', () => {
    expect(registerMasterNodeInputSchema.parse(registrationInput)).toEqual(registrationInput);
  });

  test('rejects an insecure registration endpoint', () => {
    expect(
      registerMasterNodeInputSchema.safeParse({
        ...registrationInput,
        endpoint: {
          ...registrationInput.endpoint,
          scheme: 'grpc'
        }
      }).success
    ).toBe(false);
  });

  test('requires a last-contact timestamp for repository registration', () => {
    expect(applyMasterNodeRegistrationRepositoryInputSchema.safeParse(registrationInput).success).toBe(false);
  });

  test('accepts a repository registration input with its last-contact timestamp', () => {
    const lastContactAt = new Date('2026-01-02T00:00:00.000Z');

    expect(
      applyMasterNodeRegistrationRepositoryInputSchema.parse({
        ...registrationInput,
        lastContactAt
      })
    ).toEqual({
      ...registrationInput,
      lastContactAt
    });
  });
});
