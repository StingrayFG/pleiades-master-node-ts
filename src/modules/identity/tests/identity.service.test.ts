import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { GenericDataLossError, GenericInternalServerError } from '@/errors/application.errors';

import { nodeIdSchema, nodeSessionIdSchema } from '../identity.domain';
import type { IdentityRepositoryContract } from '../identity.repository';
import { IdentityService } from '../identity.service';

/* fixtures */

const existingNodeId = nodeIdSchema.parse('master-node-aaaaaaaaaaaa');
const concurrentlyCreatedNodeId = nodeIdSchema.parse('master-node-bbbbbbbbbbbb');

/* mocks */

const createIdentityRepositoryMock = (): jest.Mocked<IdentityRepositoryContract> => {
  const repository = {
    findNodeId: jest.fn<IdentityRepositoryContract['findNodeId']>(),
    createNodeId: jest.fn<IdentityRepositoryContract['createNodeId']>()
  };

  repository.findNodeId.mockReturnValue(null);
  repository.createNodeId.mockReturnValue(true);

  return repository;
};

/* tests */

describe('IdentityService', () => {
  let repository: jest.Mocked<IdentityRepositoryContract>;
  let service: IdentityService;

  beforeEach(() => {
    repository = createIdentityRepositoryMock();
    service = new IdentityService(repository);
  });

  test('returns and caches an existing node ID', () => {
    repository.findNodeId.mockReturnValue(existingNodeId);

    expect(service.getNodeId()).toBe(existingNodeId);
    expect(service.getNodeId()).toBe(existingNodeId);
    expect(repository.findNodeId).toHaveBeenCalledTimes(1);
    expect(repository.createNodeId).not.toHaveBeenCalled();
  });

  test('generates, persists, and caches a node ID when none exists', () => {
    const nodeId = service.getNodeId();

    expect(nodeIdSchema.safeParse(nodeId).success).toBe(true);
    expect(repository.createNodeId).toHaveBeenCalledWith(nodeId);

    expect(service.getNodeId()).toBe(nodeId);
    expect(repository.findNodeId).toHaveBeenCalledTimes(1);
    expect(repository.createNodeId).toHaveBeenCalledTimes(1);
  });

  test('uses the persisted node ID when another creator wins the write race', () => {
    repository.findNodeId.mockReturnValueOnce(null).mockReturnValueOnce(concurrentlyCreatedNodeId);
    repository.createNodeId.mockReturnValue(false);

    expect(service.getNodeId()).toBe(concurrentlyCreatedNodeId);
    expect(repository.findNodeId).toHaveBeenCalledTimes(2);
    expect(repository.createNodeId).toHaveBeenCalledTimes(1);
  });

  test('throws when a concurrently created node ID cannot be read', () => {
    repository.findNodeId.mockReturnValueOnce(null).mockReturnValueOnce(null);
    repository.createNodeId.mockReturnValue(false);

    expect(() => service.getNodeId()).toThrow(GenericInternalServerError);
    expect(repository.findNodeId).toHaveBeenCalledTimes(2);
  });

  test('propagates repository failures without attempting node ID creation', () => {
    const repositoryError = new GenericDataLossError('The persisted node ID is invalid');

    repository.findNodeId.mockImplementation(() => {
      throw repositoryError;
    });

    expect(() => service.getNodeId()).toThrow(repositoryError);
    expect(repository.createNodeId).not.toHaveBeenCalled();
  });

  test('returns a stable UUID session ID for the service lifetime', () => {
    const sessionId = service.getNodeSessionId();

    expect(nodeSessionIdSchema.safeParse(sessionId).success).toBe(true);
    expect(service.getNodeSessionId()).toBe(sessionId);
    expect(repository.findNodeId).not.toHaveBeenCalled();
    expect(repository.createNodeId).not.toHaveBeenCalled();
  });

  test('generates a different session ID for each service instance', () => {
    const otherService = new IdentityService(repository);

    expect(otherService.getNodeSessionId()).not.toBe(service.getNodeSessionId());
  });
});
