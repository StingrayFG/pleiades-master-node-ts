import { Buffer } from 'node:buffer';

import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { z } from 'zod';

import { GenericInternalServerError } from '@/errors/application.errors';
import { createTaskDefinition } from '@/modules/tasks/task.definition';

import type { MasterNode } from '../master-node.domain';
import type { MasterNodeGrpcClientContract } from '../master-node.grpc-client';
import type { MasterNodeServiceContract } from '../master-node.service';
import { MasterNodeTaskForwarder } from '../master-node.task-forwarder';

/* fixtures */

const leaderMasterNodeId = 'master-node-aaaaaaaaaaaa';
const now = new Date('2026-01-01T00:00:00.000Z');

const leader: MasterNode = {
  id: leaderMasterNodeId,
  certificateFingerprint: 'ab'.repeat(32),
  sessionId: '00000000-0000-4000-8000-000000000001',
  state: 'active',
  mode: 'serving',
  hostname: 'leader.internal',
  port: 4410,
  scheme: 'grpcs',
  registeredAt: now,
  lastContactAt: now,
  lastHeartbeatAt: null,
  updatedAt: now,
  revision: 1n
};

const resultDefinition = createTaskDefinition({
  type: 'test.result',
  executionScope: 'cluster',
  dataSchema: z.object({ value: z.string() }),
  resultSchema: z.object({ result: z.string() })
});

const voidDefinition = createTaskDefinition({
  type: 'test.void',
  executionScope: 'cluster',
  dataSchema: z.object({ value: z.string() })
});

/* mocks */

const createGrpcClientMock = (): jest.Mocked<MasterNodeGrpcClientContract> => {
  return {
    fetchMasterInfo: jest.fn<MasterNodeGrpcClientContract['fetchMasterInfo']>(),
    registerMasterNode: jest.fn<MasterNodeGrpcClientContract['registerMasterNode']>(),
    fetchClusterMembershipSnapshot: jest.fn<MasterNodeGrpcClientContract['fetchClusterMembershipSnapshot']>(),
    fetchTaskEntries: jest.fn<MasterNodeGrpcClientContract['fetchTaskEntries']>(),
    fetchTaskPayload: jest.fn<MasterNodeGrpcClientContract['fetchTaskPayload']>(),
    forwardTask: jest.fn<MasterNodeGrpcClientContract['forwardTask']>(),
    requestVote: jest.fn<MasterNodeGrpcClientContract['requestVote']>(),
    recordLeaderHeartbeat: jest.fn<MasterNodeGrpcClientContract['recordLeaderHeartbeat']>(),
    close: jest.fn<MasterNodeGrpcClientContract['close']>()
  };
};

const createMasterNodeServiceMock = (): jest.Mocked<MasterNodeServiceContract> => {
  return {
    listMasterNodes: jest.fn<MasterNodeServiceContract['listMasterNodes']>(),
    getMasterNodeById: jest.fn<MasterNodeServiceContract['getMasterNodeById']>().mockResolvedValue(leader),
    registerMasterNode: jest.fn<MasterNodeServiceContract['registerMasterNode']>(),
    transitionMasterNodeMode: jest.fn<MasterNodeServiceContract['transitionMasterNodeMode']>()
  };
};

/* tests */

describe('MasterNodeTaskForwarder', () => {
  let grpcClient: jest.Mocked<MasterNodeGrpcClientContract>;
  let forwarder: MasterNodeTaskForwarder;

  beforeEach(() => {
    grpcClient = createGrpcClientMock();
    forwarder = new MasterNodeTaskForwarder(grpcClient, createMasterNodeServiceMock());
  });

  test('forwards task data and decodes the declared result', async () => {
    grpcClient.forwardTask.mockResolvedValue(Buffer.from(JSON.stringify({ result: 'done' })));

    await expect(forwarder.forwardTask(resultDefinition, { value: 'input' }, leaderMasterNodeId)).resolves.toEqual({
      result: 'done'
    });

    expect(grpcClient.forwardTask).toHaveBeenCalledWith({
      masterNodeEndpoint: {
        hostname: leader.hostname,
        port: leader.port,
        scheme: leader.scheme
      },
      expectedCertificateFingerprint: leader.certificateFingerprint,
      type: resultDefinition.type,
      data: Buffer.from(JSON.stringify({ value: 'input' }))
    });
  });

  test('rejects an absent declared result', async () => {
    grpcClient.forwardTask.mockResolvedValue(undefined);

    await expect(
      forwarder.forwardTask(resultDefinition, { value: 'input' }, leaderMasterNodeId)
    ).rejects.toBeInstanceOf(GenericInternalServerError);
  });

  test('returns no result for a task without a result schema', async () => {
    grpcClient.forwardTask.mockResolvedValue(undefined);

    await expect(
      forwarder.forwardTask(voidDefinition, { value: 'input' }, leaderMasterNodeId)
    ).resolves.toBeUndefined();
  });

  test('rejects an unexpected result for a task without a result schema', async () => {
    grpcClient.forwardTask.mockResolvedValue(Buffer.from(JSON.stringify({ result: 'unexpected' })));

    await expect(forwarder.forwardTask(voidDefinition, { value: 'input' }, leaderMasterNodeId)).rejects.toBeInstanceOf(
      GenericInternalServerError
    );
  });
});
