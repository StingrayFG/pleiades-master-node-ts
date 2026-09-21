import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import { GenericConflictError, GenericNotFoundError } from '@/errors/application.errors';

import type { RegisterMasterNodeInput } from '../master-node.application';
import type { MasterNode } from '../master-node.domain';
import type { MasterNodeRepositoryContract } from '../master-node.repository';
import { MasterNodeService } from '../master-node.service';

/* fixtures */

const masterNodeId = 'master-node-012345abcdef';
const certificateFingerprint = 'ab'.repeat(32);
const lastContactAt = new Date('2026-01-02T00:00:00.000Z');

const masterNode: MasterNode = {
  id: masterNodeId,

  certificateFingerprint,
  sessionId: '00000000-0000-4000-8000-000000000001',
  state: 'active',
  mode: 'serving',

  hostname: 'master-node.internal',
  port: 50051,
  scheme: 'grpcs',

  registeredAt: new Date('2026-01-01T00:00:00.000Z'),
  lastContactAt,
  lastHealthCheckAt: null,
  lastHeartbeatAt: null,
  updatedAt: lastContactAt,

  revision: 1n
};

const registrationInput: RegisterMasterNodeInput = {
  id: masterNodeId,

  certificateFingerprint,
  sessionId: masterNode.sessionId,
  state: 'active',
  mode: 'serving',

  endpoint: {
    hostname: masterNode.hostname,
    port: masterNode.port,
    scheme: 'grpcs'
  }
};

/* mocks */

const createMasterNodeRepositoryMock = (): jest.Mocked<MasterNodeRepositoryContract> => {
  const repository = {
    listAll: jest.fn<MasterNodeRepositoryContract['listAll']>(),
    findById: jest.fn<MasterNodeRepositoryContract['findById']>(),
    applyRegistration: jest.fn<MasterNodeRepositoryContract['applyRegistration']>()
  };

  repository.listAll.mockResolvedValue([]);
  repository.findById.mockResolvedValue(null);
  repository.applyRegistration.mockResolvedValue(masterNode);

  return repository;
};

/* tests */

describe('MasterNodeService', () => {
  let repository: jest.Mocked<MasterNodeRepositoryContract>;
  let service: MasterNodeService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(lastContactAt);

    repository = createMasterNodeRepositoryMock();
    service = new MasterNodeService(repository);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('lists master nodes', async () => {
    const masterNodes = [masterNode];

    repository.listAll.mockResolvedValue(masterNodes);

    await expect(service.listMasterNodes()).resolves.toBe(masterNodes);
    expect(repository.listAll).toHaveBeenCalledWith();
  });

  test('returns a master node found by id', async () => {
    repository.findById.mockResolvedValue(masterNode);

    await expect(service.getMasterNodeById(masterNodeId)).resolves.toBe(masterNode);
    expect(repository.findById).toHaveBeenCalledWith(masterNodeId);
  });

  test('throws when a master node cannot be found', async () => {
    await expect(service.getMasterNodeById(masterNodeId)).rejects.toBeInstanceOf(GenericNotFoundError);
  });

  test('registers a new master node', async () => {
    await expect(service.registerMasterNode(registrationInput)).resolves.toBe(masterNode);
    expect(repository.findById).toHaveBeenCalledWith(masterNodeId);
    expect(repository.applyRegistration).toHaveBeenCalledWith({
      ...registrationInput,
      lastContactAt
    });
  });

  test('accepts repeated registration from the same master node session', async () => {
    repository.findById.mockResolvedValue(masterNode);

    await expect(service.registerMasterNode(registrationInput)).resolves.toBe(masterNode);
    expect(repository.applyRegistration).toHaveBeenCalledWith({
      ...registrationInput,
      lastContactAt
    });
  });

  test('refreshes a master node session with its existing certificate', async () => {
    repository.findById.mockResolvedValue(masterNode);

    const restartedInput: RegisterMasterNodeInput = {
      ...registrationInput,
      sessionId: '00000000-0000-4000-8000-000000000099'
    };

    await expect(service.registerMasterNode(restartedInput)).resolves.toBe(masterNode);
    expect(repository.applyRegistration).toHaveBeenCalledWith({
      ...restartedInput,
      lastContactAt
    });
  });

  test('rejects re-registration with a different certificate', async () => {
    repository.findById.mockResolvedValue(masterNode);

    const conflictingInput: RegisterMasterNodeInput = {
      ...registrationInput,
      certificateFingerprint: 'cd'.repeat(32)
    };

    await expect(service.registerMasterNode(conflictingInput)).rejects.toBeInstanceOf(GenericConflictError);
    expect(repository.applyRegistration).not.toHaveBeenCalled();
  });
});
