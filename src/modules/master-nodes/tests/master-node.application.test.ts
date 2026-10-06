import { describe, expect, test } from '@jest/globals';

import {
  applyMasterNodeRegistrationRepositoryInputSchema,
  fetchMasterInfoClientInputSchema,
  fetchTaskEntriesClientInputSchema,
  fetchTaskEntriesInternodeInputSchema,
  fetchTaskEntriesInternodeResultSchema,
  fetchTaskPayloadClientInputSchema,
  fetchTaskPayloadInternodeInputSchema,
  internodeTaskEntrySchema,
  registerMasterNodeClientInputSchema,
  registerMasterNodeInternodeInputSchema,
  registerMasterNodeInputSchema,
  transitionMasterNodeModeRepositoryInputSchema
} from '../master-node.application';

/* fixtures */

const registrationInput = {
  id: 'master-node-aaaaaaaaaaaa',

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

const taskEntry = {
  id: '00000000-0000-4000-8000-000000000002',
  originMasterNodeId: registrationInput.id,
  epoch: 1n,
  sequence: 0n,
  type: 'bucket.create',
  executionScope: 'cluster',
  data: { bucketName: 'test-bucket' },
  payloadId: '00000000-0000-4000-8000-000000000003',
  createdAt: new Date('2026-01-02T00:00:00.000Z')
} as const;

const authenticatedCaller = {
  callerMasterNodeId: registrationInput.id,
  callerMasterNodeSessionId: registrationInput.sessionId,
  callerCertificateFingerprint: registrationInput.certificateFingerprint
};

/* tests */

describe('master node application schemas', () => {
  test('accepts a valid registration input', () => {
    expect(registerMasterNodeInputSchema.parse(registrationInput)).toEqual(registrationInput);
  });

  test('accepts internode and client master node registration inputs', () => {
    const internodeInput = {
      id: registrationInput.id,
      certificateFingerprint: registrationInput.certificateFingerprint,
      sessionId: registrationInput.sessionId,
      clusterId: '00000000-0000-4000-8000-000000000010',
      endpoint: registrationInput.endpoint
    };

    expect(registerMasterNodeInternodeInputSchema.parse(internodeInput)).toEqual(internodeInput);
    const clientInput = {
      masterNodeEndpoint: registrationInput.endpoint,
      expectedCertificateFingerprint: registrationInput.certificateFingerprint,
      id: internodeInput.id,
      sessionId: internodeInput.sessionId,
      clusterId: internodeInput.clusterId,
      endpoint: internodeInput.endpoint
    };

    expect(registerMasterNodeClientInputSchema.parse(clientInput)).toEqual(clientInput);
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

  test('accepts a gated master node mode transition', () => {
    const input = {
      id: registrationInput.id,
      from: 'serving',
      to: 'draining',
      expectedRevision: 1n
    } as const;

    expect(transitionMasterNodeModeRepositoryInputSchema.parse(input)).toEqual(input);
  });

  test('accepts an internode task entry', () => {
    expect(internodeTaskEntrySchema.parse(taskEntry)).toEqual(taskEntry);
  });

  test('caps task-entry fetch limits at the protocol maximum', () => {
    expect(
      fetchTaskEntriesInternodeInputSchema.parse({
        ...authenticatedCaller,
        afterSequence: -1n,
        limit: 128
      })
    ).toEqual({
      ...authenticatedCaller,
      afterSequence: -1n,
      limit: 128
    });
    expect(() =>
      fetchTaskEntriesInternodeInputSchema.parse({
        ...authenticatedCaller,
        afterSequence: -1n,
        limit: 129
      })
    ).toThrow();
    expect(() =>
      fetchTaskEntriesClientInputSchema.parse({
        masterNodeEndpoint: { hostname: 'leader.internal', port: 4410, scheme: 'grpcs' },
        expectedCertificateFingerprint: 'ab'.repeat(32),
        afterSequence: -1n,
        limit: 129
      })
    ).toThrow();
  });

  test('accepts the initial task-entry range and an empty uncommitted result', () => {
    expect(
      fetchTaskEntriesInternodeInputSchema.parse({
        ...authenticatedCaller,
        afterSequence: -1n,
        limit: 32
      })
    ).toEqual({
      ...authenticatedCaller,
      afterSequence: -1n,
      limit: 32
    });
    expect(
      fetchTaskEntriesInternodeResultSchema.parse({
        epoch: 0n,
        lastCommittedSequence: -1n,
        clusterMembershipRevision: 0n,
        entries: []
      })
    ).toEqual({
      epoch: 0n,
      lastCommittedSequence: -1n,
      clusterMembershipRevision: 0n,
      entries: []
    });
  });

  test('rejects invalid task-entry range bounds', () => {
    expect(
      fetchTaskEntriesInternodeInputSchema.safeParse({ ...authenticatedCaller, afterSequence: -2n, limit: 32 }).success
    ).toBe(false);
    expect(
      fetchTaskEntriesInternodeInputSchema.safeParse({ ...authenticatedCaller, afterSequence: -1n, limit: 0 }).success
    ).toBe(false);
  });

  test('accepts internode and client payload requests', () => {
    const payloadInput = { ...authenticatedCaller, payloadId: taskEntry.payloadId };

    expect(fetchTaskPayloadInternodeInputSchema.parse(payloadInput)).toEqual(payloadInput);
    expect(
      fetchTaskPayloadClientInputSchema.parse({
        masterNodeEndpoint: registrationInput.endpoint,
        expectedCertificateFingerprint: registrationInput.certificateFingerprint,
        payloadId: taskEntry.payloadId
      })
    ).toEqual({
      masterNodeEndpoint: registrationInput.endpoint,
      expectedCertificateFingerprint: registrationInput.certificateFingerprint,
      payloadId: taskEntry.payloadId
    });
  });

  test('accepts client task-entry requests with a secure master endpoint', () => {
    const input = {
      masterNodeEndpoint: registrationInput.endpoint,
      expectedCertificateFingerprint: registrationInput.certificateFingerprint,
      afterSequence: -1n,
      limit: 32
    };

    expect(fetchTaskEntriesClientInputSchema.parse(input)).toEqual(input);
  });

  test('requires the expected certificate fingerprint for master client requests', () => {
    const input = {
      masterNodeEndpoint: registrationInput.endpoint,
      expectedCertificateFingerprint: registrationInput.certificateFingerprint
    };

    expect(fetchMasterInfoClientInputSchema.parse(input)).toEqual(input);
    expect(fetchMasterInfoClientInputSchema.safeParse({ masterNodeEndpoint: registrationInput.endpoint }).success).toBe(
      false
    );
  });
});
