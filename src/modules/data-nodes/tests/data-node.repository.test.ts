import { Prisma, type DataNode as PrismaDataNode, type PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { GenericConflictError, GenericMapperError } from '@/errors/application.errors';

import type {
  ApplyDataNodeRegistrationRepositoryInput,
  ApplyHeartbeatRepositoryInput,
  RecordDataNodeHealthCheckRepositoryInput,
  UpdateDataNodeStateRepositoryInput
} from '../data-node.application';
import type { DataNode } from '../data-node.domain';
import { DataNodeRepository } from '../data-node.repository';

/* fixtures */

const dataNodeId = 'data-node-1';
const certificateFingerprint = 'ab'.repeat(32);
const sessionId = '00000000-0000-4000-8000-000000000001';
const lastContactAt = new Date('2026-01-02T00:00:00.000Z');

const prismaDataNode: PrismaDataNode = {
  id: dataNodeId,

  certificate_fingerprint: certificateFingerprint,
  session_id: sessionId,
  last_heartbeat_sequence: 2n,
  state: 'active',
  mode: 'serving',

  hostname: 'data-node.internal',
  port: 50051,
  scheme: 'grpcs',

  storage_total_bytes: 1_000n,
  storage_free_bytes: 400n,

  registered_at: new Date('2026-01-01T00:00:00.000Z'),
  last_contact_at: lastContactAt,
  last_health_check_at: null,
  last_heartbeat_at: lastContactAt,
  updated_at: lastContactAt,

  revision: 3n
};

const domainDataNode: DataNode = {
  id: prismaDataNode.id,

  certificateFingerprint: prismaDataNode.certificate_fingerprint,
  sessionId: prismaDataNode.session_id,
  lastHeartbeatSequence: prismaDataNode.last_heartbeat_sequence,
  state: prismaDataNode.state,
  mode: prismaDataNode.mode,

  hostname: prismaDataNode.hostname,
  port: prismaDataNode.port,
  scheme: 'grpcs',

  storageTotalBytes: prismaDataNode.storage_total_bytes,
  storageFreeBytes: prismaDataNode.storage_free_bytes,

  registeredAt: prismaDataNode.registered_at,
  lastContactAt: prismaDataNode.last_contact_at,
  lastHealthCheckAt: prismaDataNode.last_health_check_at,
  lastHeartbeatAt: prismaDataNode.last_heartbeat_at,
  updatedAt: prismaDataNode.updated_at,

  revision: prismaDataNode.revision
};

const registrationInput: ApplyDataNodeRegistrationRepositoryInput = {
  id: dataNodeId,

  certificateFingerprint,
  sessionId,
  state: 'joining',

  endpoint: {
    hostname: 'data-node.internal',
    port: 50051,
    scheme: 'grpcs'
  },

  storageTotalBytes: 1_000n,
  storageFreeBytes: 400n,

  lastContactAt,

  expectedRevision: null
};

const heartbeatInput: ApplyHeartbeatRepositoryInput = {
  id: dataNodeId,

  certificateFingerprint,
  sessionId,
  heartbeatSequence: 3n,
  state: 'active',

  storageTotalBytes: 1_000n,
  storageFreeBytes: 350n,

  lastContactAt,
  lastHeartbeatAt: lastContactAt
};

const createPrismaError = (code: string, target?: string[]): Prisma.PrismaClientKnownRequestError => {
  return new Prisma.PrismaClientKnownRequestError('Prisma operation failed', {
    code,
    clientVersion: 'test',
    meta: target ? { target } : undefined
  });
};

/* mocks */

const createDataNodeDelegateMock = () => {
  const delegate = {
    findMany: jest.fn<(input?: unknown) => Promise<PrismaDataNode[]>>(),
    findUnique: jest.fn<(input: unknown) => Promise<PrismaDataNode | null>>(),
    create: jest.fn<(input: unknown) => Promise<PrismaDataNode>>(),
    updateMany: jest.fn<(input: unknown) => Promise<{ count: number }>>()
  };

  delegate.findMany.mockResolvedValue([]);
  delegate.findUnique.mockResolvedValue(null);
  delegate.create.mockResolvedValue(prismaDataNode);
  delegate.updateMany.mockResolvedValue({ count: 1 });

  return delegate;
};

/* tests */

describe('DataNodeRepository', () => {
  let delegate: ReturnType<typeof createDataNodeDelegateMock>;
  let repository: DataNodeRepository;

  beforeEach(() => {
    delegate = createDataNodeDelegateMock();

    const prisma = {
      dataNode: delegate
    } as unknown as PrismaClient;

    repository = new DataNodeRepository(prisma);
  });

  test('lists all data nodes', async () => {
    delegate.findMany.mockResolvedValue([prismaDataNode]);

    await expect(repository.listAll()).resolves.toEqual([domainDataNode]);
    expect(delegate.findMany).toHaveBeenCalledWith();
  });

  test('lists active serving data nodes as available', async () => {
    delegate.findMany.mockResolvedValue([prismaDataNode]);

    await expect(repository.listAvailable()).resolves.toEqual([domainDataNode]);
    expect(delegate.findMany).toHaveBeenCalledWith({
      where: {
        state: 'active',
        mode: 'serving'
      }
    });
  });

  test('propagates mapper errors from invalid Prisma rows', async () => {
    delegate.findMany.mockResolvedValue([
      {
        ...prismaDataNode,
        port: 0
      }
    ]);

    await expect(repository.listAll()).rejects.toBeInstanceOf(GenericMapperError);
  });

  test('finds a data node by id', async () => {
    delegate.findUnique.mockResolvedValue(prismaDataNode);

    await expect(repository.findById(dataNodeId)).resolves.toEqual(domainDataNode);
    expect(delegate.findUnique).toHaveBeenCalledWith({
      where: {
        id: dataNodeId
      }
    });
  });

  test('returns null when a data node cannot be found', async () => {
    await expect(repository.findById(dataNodeId)).resolves.toBeNull();
  });

  test('creates a new data node registration', async () => {
    await expect(repository.applyRegistration(registrationInput)).resolves.toBe(true);
    expect(delegate.create).toHaveBeenCalledWith({
      data: {
        id: dataNodeId,

        certificate_fingerprint: certificateFingerprint,
        session_id: sessionId,
        last_heartbeat_sequence: 0n,
        state: 'joining',
        mode: 'serving',

        hostname: 'data-node.internal',
        port: 50051,
        scheme: 'grpcs',

        storage_total_bytes: 1_000n,
        storage_free_bytes: 400n,

        last_contact_at: lastContactAt,
        last_heartbeat_at: null
      }
    });
  });

  test('returns false when another registration creates the same data node first', async () => {
    delegate.create.mockRejectedValue(createPrismaError('P2002', ['id']));

    await expect(repository.applyRegistration(registrationInput)).resolves.toBe(false);
  });

  test('rejects a certificate already registered to another data node', async () => {
    delegate.create.mockRejectedValue(createPrismaError('P2002', ['certificate_fingerprint']));

    await expect(repository.applyRegistration(registrationInput)).rejects.toBeInstanceOf(GenericConflictError);
  });

  test('updates an existing registration only at its expected revision', async () => {
    const existingRegistrationInput: ApplyDataNodeRegistrationRepositoryInput = {
      ...registrationInput,
      expectedRevision: 3n
    };

    await expect(repository.applyRegistration(existingRegistrationInput)).resolves.toBe(true);
    expect(delegate.updateMany).toHaveBeenCalledWith({
      where: {
        id: dataNodeId,
        revision: 3n
      },
      data: {
        session_id: sessionId,
        last_heartbeat_sequence: 0n,
        state: 'joining',

        hostname: 'data-node.internal',
        port: 50051,
        scheme: 'grpcs',

        storage_total_bytes: 1_000n,
        storage_free_bytes: 400n,

        last_contact_at: lastContactAt,
        last_heartbeat_at: null,

        revision: {
          increment: 1
        }
      }
    });
  });

  test('returns false when an existing registration revision has changed', async () => {
    delegate.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      repository.applyRegistration({
        ...registrationInput,
        expectedRevision: 3n
      })
    ).resolves.toBe(false);
  });

  test('applies only a newer heartbeat for the current certificate and session', async () => {
    await expect(repository.applyHeartbeat(heartbeatInput)).resolves.toBe(true);
    expect(delegate.updateMany).toHaveBeenCalledWith({
      where: {
        id: dataNodeId,
        certificate_fingerprint: certificateFingerprint,
        session_id: sessionId,
        last_heartbeat_sequence: {
          lt: 3n
        }
      },
      data: {
        state: 'active',
        last_heartbeat_sequence: 3n,

        storage_total_bytes: 1_000n,
        storage_free_bytes: 350n,

        last_contact_at: lastContactAt,
        last_heartbeat_at: lastContactAt,

        revision: {
          increment: 1
        }
      }
    });
  });

  test('returns false when a heartbeat cannot be applied', async () => {
    delegate.updateMany.mockResolvedValue({ count: 0 });

    await expect(repository.applyHeartbeat(heartbeatInput)).resolves.toBe(false);
  });

  test('records a health check only at its expected revision', async () => {
    const input: RecordDataNodeHealthCheckRepositoryInput = {
      id: dataNodeId,
      lastHealthCheckAt: lastContactAt,
      expectedRevision: 3n
    };

    await expect(repository.applyHealthCheck(input)).resolves.toBe(true);
    expect(delegate.updateMany).toHaveBeenCalledWith({
      where: {
        id: dataNodeId,
        revision: 3n
      },
      data: {
        last_health_check_at: lastContactAt,
        revision: {
          increment: 1
        }
      }
    });
  });

  test('updates state only at its expected revision', async () => {
    const input: UpdateDataNodeStateRepositoryInput = {
      id: dataNodeId,
      state: 'offline',
      expectedRevision: 3n
    };

    await expect(repository.updateStateIfRevisionUnchanged(input)).resolves.toBe(true);
    expect(delegate.updateMany).toHaveBeenCalledWith({
      where: {
        id: dataNodeId,
        revision: 3n
      },
      data: {
        state: 'offline',
        revision: {
          increment: 1
        }
      }
    });
  });

  test('preserves unmapped Prisma failures', async () => {
    const repositoryError = new Error('Unexpected repository failure');

    delegate.findMany.mockRejectedValue(repositoryError);

    await expect(repository.listAll()).rejects.toBe(repositoryError);
  });
});
