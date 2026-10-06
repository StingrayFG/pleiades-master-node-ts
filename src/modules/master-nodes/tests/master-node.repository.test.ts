import { Prisma, type MasterNode as PrismaMasterNode, type PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { GenericAlreadyExistsError, GenericConflictError, GenericMapperError } from '@/errors/application.errors';

import type { ApplyMasterNodeRegistrationRepositoryInput } from '../master-node.application';
import type { MasterNode } from '../master-node.domain';
import { MasterNodeRepository } from '../master-node.repository';

/* fixtures */

const masterNodeId = 'master-node-aaaaaaaaaaaa';
const lastContactAt = new Date('2026-01-02T00:00:00.000Z');

const prismaMasterNode: PrismaMasterNode = {
  id: masterNodeId,
  cluster_record_id: 'self',

  certificate_fingerprint: 'ab'.repeat(32),
  session_id: '00000000-0000-4000-8000-000000000001',
  state: 'active',
  mode: 'serving',

  hostname: 'master-node.internal',
  port: 50051,
  scheme: 'grpcs',

  registered_at: new Date('2026-01-01T00:00:00.000Z'),
  last_contact_at: lastContactAt,
  last_health_check_at: null,
  last_heartbeat_at: null,
  removed_at: null,
  updated_at: lastContactAt,

  revision: 1n
};

const domainMasterNode: MasterNode = {
  id: prismaMasterNode.id,

  certificateFingerprint: prismaMasterNode.certificate_fingerprint,
  sessionId: prismaMasterNode.session_id,
  state: prismaMasterNode.state,
  mode: prismaMasterNode.mode,

  hostname: prismaMasterNode.hostname,
  port: prismaMasterNode.port,
  scheme: 'grpcs',

  registeredAt: prismaMasterNode.registered_at,
  lastContactAt: prismaMasterNode.last_contact_at,
  lastHealthCheckAt: prismaMasterNode.last_health_check_at,
  lastHeartbeatAt: prismaMasterNode.last_heartbeat_at,
  updatedAt: prismaMasterNode.updated_at,

  revision: prismaMasterNode.revision
};

const registrationInput: ApplyMasterNodeRegistrationRepositoryInput = {
  id: masterNodeId,

  certificateFingerprint: prismaMasterNode.certificate_fingerprint,
  sessionId: prismaMasterNode.session_id,
  state: 'active',
  mode: 'serving',

  endpoint: {
    hostname: prismaMasterNode.hostname,
    port: prismaMasterNode.port,
    scheme: 'grpcs'
  },

  lastContactAt
};

const createPrismaError = (code: string): Prisma.PrismaClientKnownRequestError => {
  return new Prisma.PrismaClientKnownRequestError('Prisma operation failed', {
    code,
    clientVersion: 'test'
  });
};

/* mocks */

const createMasterNodeDelegateMock = () => {
  const delegate = {
    findMany: jest.fn<(input: unknown) => Promise<PrismaMasterNode[]>>(),
    findFirst: jest.fn<(input: unknown) => Promise<PrismaMasterNode | null>>(),
    findUnique: jest.fn<(input: unknown) => Promise<PrismaMasterNode | null>>(),
    findUniqueOrThrow: jest.fn<(input: unknown) => Promise<PrismaMasterNode>>(),
    create: jest.fn<(input: unknown) => Promise<PrismaMasterNode>>(),
    upsert: jest.fn<(input: unknown) => Promise<PrismaMasterNode>>(),
    updateMany: jest.fn<(input: unknown) => Promise<{ count: number }>>()
  };

  delegate.findMany.mockResolvedValue([]);
  delegate.findFirst.mockResolvedValue(null);
  delegate.findUnique.mockResolvedValue(null);
  delegate.findUniqueOrThrow.mockResolvedValue(prismaMasterNode);
  delegate.create.mockResolvedValue(prismaMasterNode);
  delegate.upsert.mockResolvedValue(prismaMasterNode);
  delegate.updateMany.mockResolvedValue({ count: 1 });

  return delegate;
};

/* tests */

describe('MasterNodeRepository', () => {
  let delegate: ReturnType<typeof createMasterNodeDelegateMock>;
  let repository: MasterNodeRepository;

  beforeEach(() => {
    delegate = createMasterNodeDelegateMock();

    const prisma = {
      masterNode: delegate
    } as unknown as PrismaClient;

    repository = new MasterNodeRepository(prisma);
  });

  test('lists all master nodes', async () => {
    delegate.findMany.mockResolvedValue([prismaMasterNode]);

    await expect(repository.listAll()).resolves.toEqual([domainMasterNode]);
    expect(delegate.findMany).toHaveBeenCalledWith({
      where: {
        cluster_record_id: 'self',
        removed_at: null
      },
      orderBy: {
        id: 'asc'
      }
    });
  });

  test('propagates mapper errors from invalid listed master nodes', async () => {
    delegate.findMany.mockResolvedValue([
      {
        ...prismaMasterNode,
        port: 0
      }
    ]);

    await expect(repository.listAll()).rejects.toBeInstanceOf(GenericMapperError);
  });

  test('finds a current cluster member by id', async () => {
    delegate.findFirst.mockResolvedValue(prismaMasterNode);

    await expect(repository.findMemberById(masterNodeId)).resolves.toEqual(domainMasterNode);
    expect(delegate.findFirst).toHaveBeenCalledWith({
      where: {
        id: masterNodeId,
        cluster_record_id: 'self',
        removed_at: null
      }
    });
  });

  test('returns null when a master node is no longer a cluster member', async () => {
    await expect(repository.findMemberById(masterNodeId)).resolves.toBeNull();
  });

  test('adopts an existing registration through the certificate-guarded update', async () => {
    await expect(repository.applyRegistration(registrationInput)).resolves.toEqual(domainMasterNode);
    expect(delegate.updateMany).toHaveBeenCalledWith({
      where: {
        id: masterNodeId,
        certificate_fingerprint: registrationInput.certificateFingerprint
      },
      data: {
        cluster_record_id: 'self',

        session_id: registrationInput.sessionId,
        state: 'active',
        mode: 'serving',

        hostname: 'master-node.internal',
        port: 50051,
        scheme: 'grpcs',

        last_contact_at: lastContactAt,
        last_heartbeat_at: null,
        removed_at: null,

        revision: {
          increment: 1
        }
      }
    });
    expect(delegate.findUniqueOrThrow).toHaveBeenCalledWith({
      where: {
        id: masterNodeId
      }
    });
    expect(delegate.create).not.toHaveBeenCalled();
  });

  test('rejects a registration with a different certificate on an existing master node', async () => {
    delegate.updateMany.mockResolvedValue({ count: 0 });
    delegate.findUnique.mockResolvedValue(prismaMasterNode);

    await expect(repository.applyRegistration(registrationInput)).rejects.toBeInstanceOf(GenericConflictError);
    expect(delegate.create).not.toHaveBeenCalled();
  });

  test('creates a registration when the master node id is free', async () => {
    delegate.updateMany.mockResolvedValue({ count: 0 });

    await expect(repository.applyRegistration(registrationInput)).resolves.toEqual(domainMasterNode);
    expect(delegate.findUnique).toHaveBeenCalledWith({
      where: {
        id: masterNodeId
      }
    });
    expect(delegate.create).toHaveBeenCalledWith({
      data: {
        id: masterNodeId,
        cluster_record_id: 'self',

        certificate_fingerprint: registrationInput.certificateFingerprint,
        session_id: registrationInput.sessionId,
        state: 'active',
        mode: 'serving',

        hostname: 'master-node.internal',
        port: 50051,
        scheme: 'grpcs',

        last_contact_at: lastContactAt,
        last_heartbeat_at: null,
        removed_at: null
      }
    });
  });

  test('maps registration uniqueness violations to an already-exists error', async () => {
    delegate.updateMany.mockResolvedValue({ count: 0 });
    delegate.create.mockRejectedValue(createPrismaError('P2002'));

    await expect(repository.applyRegistration(registrationInput)).rejects.toBeInstanceOf(GenericAlreadyExistsError);
  });

  test('transitions a master node mode at the expected revision', async () => {
    await expect(
      repository.transitionMode({
        id: masterNodeId,
        from: 'serving',
        to: 'draining',
        expectedRevision: 1n
      })
    ).resolves.toBe(true);
    expect(delegate.updateMany).toHaveBeenCalledWith({
      where: {
        id: masterNodeId,
        cluster_record_id: 'self',
        removed_at: null,
        mode: 'serving',
        revision: 1n
      },
      data: {
        mode: 'draining',
        revision: {
          increment: 1
        }
      }
    });
  });

  test('returns false when the master node mode transition loses its concurrency gate', async () => {
    delegate.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      repository.transitionMode({
        id: masterNodeId,
        from: 'serving',
        to: 'draining',
        expectedRevision: 1n
      })
    ).resolves.toBe(false);
  });

  test('preserves unmapped Prisma failures', async () => {
    const repositoryError = new Error('Unexpected repository failure');

    delegate.findMany.mockRejectedValue(repositoryError);

    await expect(repository.listAll()).rejects.toBe(repositoryError);
  });
});
