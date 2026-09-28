import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
  GenericAbortedError,
  GenericConflictError,
  GenericFailedPreconditionError,
  GenericNotFoundError
} from '@/errors/application.errors';
import type { ClusterServiceContract } from '@/modules/cluster/cluster.service';
import type { ConsensusState } from '@/modules/consensus/consensus.domain';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';

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

const consensusState: ConsensusState = {
  id: 'self',
  currentEpoch: 1n,
  leaderMasterId: masterNodeId,
  votedForMasterId: masterNodeId,
  lastLeaderContactAt: lastContactAt,
  lastAllocatedSequence: -1n,
  lastCommittedSequence: -1n,
  lastAppliedSequence: -1n,
  createdAt: lastContactAt,
  updatedAt: lastContactAt,
  revision: 1n
};

/* mocks */

const createMasterNodeRepositoryMock = (): jest.Mocked<MasterNodeRepositoryContract> => {
  const repository = {
    listAll: jest.fn<MasterNodeRepositoryContract['listAll']>(),
    findById: jest.fn<MasterNodeRepositoryContract['findById']>(),
    findMemberById: jest.fn<MasterNodeRepositoryContract['findMemberById']>(),
    applyRegistration: jest.fn<MasterNodeRepositoryContract['applyRegistration']>(),
    transitionMode: jest.fn<MasterNodeRepositoryContract['transitionMode']>()
  };

  repository.listAll.mockResolvedValue([]);
  repository.findById.mockResolvedValue(null);
  repository.findMemberById.mockResolvedValue(null);
  repository.applyRegistration.mockResolvedValue(masterNode);
  repository.transitionMode.mockResolvedValue(true);

  return repository;
};

const createConsensusServiceMock = (): jest.Mocked<ConsensusServiceContract> => {
  return {
    getConsensusState: jest.fn<ConsensusServiceContract['getConsensusState']>().mockResolvedValue(consensusState)
  } as unknown as jest.Mocked<ConsensusServiceContract>;
};

const createClusterServiceMock = (): jest.Mocked<ClusterServiceContract> => {
  return {
    advanceMembershipRevision: jest.fn<ClusterServiceContract['advanceMembershipRevision']>().mockResolvedValue({
      id: 'self',
      clusterId: '00000000-0000-4000-8000-000000000001',
      membershipRevision: 2n,
      createdAt: lastContactAt,
      updatedAt: lastContactAt
    })
  } as unknown as jest.Mocked<ClusterServiceContract>;
};

/* tests */

describe('MasterNodeService', () => {
  let repository: jest.Mocked<MasterNodeRepositoryContract>;
  let consensusService: jest.Mocked<ConsensusServiceContract>;
  let clusterService: jest.Mocked<ClusterServiceContract>;
  let service: MasterNodeService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(lastContactAt);

    repository = createMasterNodeRepositoryMock();
    consensusService = createConsensusServiceMock();
    clusterService = createClusterServiceMock();
    service = new MasterNodeService(repository, consensusService, clusterService, masterNodeId);
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
    repository.findMemberById.mockResolvedValue(masterNode);

    await expect(service.getMasterNodeById(masterNodeId)).resolves.toBe(masterNode);
    expect(repository.findMemberById).toHaveBeenCalledWith(masterNodeId);
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

  test('changes a master node mode and advances the membership revision', async () => {
    const drainingMasterNode: MasterNode = {
      ...masterNode,
      mode: 'draining',
      revision: 2n
    };

    repository.findMemberById.mockResolvedValueOnce(masterNode).mockResolvedValueOnce(drainingMasterNode);

    await expect(service.setMasterNodeMode(masterNodeId, 'draining')).resolves.toBe(drainingMasterNode);
    expect(repository.transitionMode).toHaveBeenCalledWith({
      id: masterNodeId,
      from: 'serving',
      to: 'draining',
      expectedRevision: masterNode.revision
    });
    expect(clusterService.advanceMembershipRevision).toHaveBeenCalledWith();
  });

  test('returns an already matching master node without another transition', async () => {
    repository.findMemberById.mockResolvedValue(masterNode);

    await expect(service.setMasterNodeMode(masterNodeId, 'serving')).resolves.toBe(masterNode);
    expect(repository.transitionMode).not.toHaveBeenCalled();
    expect(clusterService.advanceMembershipRevision).not.toHaveBeenCalled();
  });

  test('rejects mode changes submitted to a follower', async () => {
    consensusService.getConsensusState.mockResolvedValue({
      ...consensusState,
      leaderMasterId: 'master-node-fedcba654321'
    });

    await expect(service.setMasterNodeMode(masterNodeId, 'draining')).rejects.toBeInstanceOf(
      GenericFailedPreconditionError
    );
    expect(repository.findMemberById).not.toHaveBeenCalled();
    expect(repository.transitionMode).not.toHaveBeenCalled();
  });

  test('accepts a concurrent transition that already reached the requested mode', async () => {
    const drainingMasterNode: MasterNode = {
      ...masterNode,
      mode: 'draining',
      revision: 2n
    };

    repository.findMemberById.mockResolvedValueOnce(masterNode).mockResolvedValueOnce(drainingMasterNode);
    repository.transitionMode.mockResolvedValue(false);

    await expect(service.setMasterNodeMode(masterNodeId, 'draining')).resolves.toBe(drainingMasterNode);
    expect(clusterService.advanceMembershipRevision).not.toHaveBeenCalled();
  });

  test('rejects a lost mode transition when the requested mode is not present', async () => {
    repository.findMemberById.mockResolvedValue(masterNode);
    repository.transitionMode.mockResolvedValue(false);

    await expect(service.setMasterNodeMode(masterNodeId, 'draining')).rejects.toBeInstanceOf(GenericAbortedError);
    expect(clusterService.advanceMembershipRevision).not.toHaveBeenCalled();
  });
});
